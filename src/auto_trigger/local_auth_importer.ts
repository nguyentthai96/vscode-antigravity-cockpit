import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
// 使用 sql.js 的 wasm 版本（需要 .wasm 文件）
import initSqlJs, { Database } from 'sql.js/dist/sql-wasm.js';
import { credentialStorage } from './credential_storage';
import { oauthService } from './oauth_service';
import { OAuthCredential } from './types';
import { logger } from '../shared/log_service';
import { getAntigravityStateDbPath, getAntigravityUserDataDir, getStateDbPathForTarget, TargetIdeType } from '../shared/antigravity_paths';

const LEGACY_STATE_KEY = 'jetskiStateSync.agentManagerInitState';
const UNIFIED_STATE_KEY = 'antigravityUnifiedStateSync.oauthToken';

// sql.js 初始化缓存
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
    if (!sqlJsPromise) {
        sqlJsPromise = initSqlJs({
            // 使用 file:// URL 格式，避免在某些 VS Code 环境下 sql.js 内部通过 fetch()
            // 加载 wasm 时将本地路径传入 new URL() 导致 "Invalid URL protocol" 错误
            locateFile: (file: string) => pathToFileURL(path.join(__dirname, file)).href,
        }).catch((err: unknown) => {
            // 初始化失败时重置缓存，避免后续调用永远使用已失败的 Promise
            sqlJsPromise = null;
            throw err;
        });
    }
    return sqlJsPromise;
}

interface LocalTokenInfo {
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    expirySeconds?: number;
    idToken?: string;
    isGcpTos?: boolean;
}

interface PendingLocalCredential {
    credential: OAuthCredential;
    createdAt: number;
}

const PENDING_CREDENTIAL_TTL_MS = 2 * 60 * 1000;
let pendingLocalCredential: PendingLocalCredential | null = null;

// 注意：state.vscdb 路径统一由 shared/antigravity_paths 提供，避免多处维护。

async function readStateValueByKey(dbPath: string, key: string): Promise<string> {
    // 检查数据库文件是否存在
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
    }

    const SQL = await getSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    let db: Database | null = null;

    try {
        db = new SQL.Database(fileBuffer);
        const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
        stmt.bind([key]);

        if (stmt.step()) {
            const row = stmt.get();
            stmt.free();
            if (row && row[0]) {
                const value = String(row[0]).trim();
                if (value.length > 0) {
                    return value;
                }
            }
        } else {
            stmt.free();
        }

        throw new Error('No state value found');
    } finally {
        if (db) {
            db.close();
        }
    }
}

function readVarint(data: Buffer, offset: number): [number, number] {
    let result = 0;
    let shift = 0;
    let pos = offset;
    while (pos < data.length) {
        const byte = data[pos];
        result += (byte & 0x7f) * Math.pow(2, shift);
        pos += 1;
        if ((byte & 0x80) === 0) {
            return [result, pos];
        }
        shift += 7;
    }
    throw new Error('Incomplete varint');
}

function skipField(data: Buffer, offset: number, wireType: number): number {
    if (wireType === 0) {
        const [, newOffset] = readVarint(data, offset);
        return newOffset;
    }
    if (wireType === 1) {
        return offset + 8;
    }
    if (wireType === 2) {
        const [length, contentOffset] = readVarint(data, offset);
        return contentOffset + length;
    }
    if (wireType === 5) {
        return offset + 4;
    }
    throw new Error(`Unknown wire type: ${wireType}`);
}

function findField(data: Buffer, targetField: number): Buffer | undefined {
    let offset = 0;
    while (offset < data.length) {
        let tag = 0;
        let newOffset = 0;
        try {
            [tag, newOffset] = readVarint(data, offset);
        } catch {
            break;
        }
        const wireType = tag & 7;
        const fieldNum = tag >> 3;
        if (fieldNum === targetField && wireType === 2) {
            const [length, contentOffset] = readVarint(data, newOffset);
            return data.subarray(contentOffset, contentOffset + length);
        }
        offset = skipField(data, newOffset, wireType);
    }
    return undefined;
}

function parseTimestamp(data: Buffer): number | undefined {
    let offset = 0;
    while (offset < data.length) {
        const [tag, newOffset] = readVarint(data, offset);
        const wireType = tag & 7;
        const fieldNum = tag >> 3;
        offset = newOffset;
        if (fieldNum === 1 && wireType === 0) {
            const [seconds] = readVarint(data, offset);
            return seconds;
        }
        offset = skipField(data, offset, wireType);
    }
    return undefined;
}

function parseOAuthTokenInfo(data: Buffer): LocalTokenInfo {
    let offset = 0;
    const info: LocalTokenInfo = {};

    while (offset < data.length) {
        const [tag, newOffset] = readVarint(data, offset);
        const wireType = tag & 7;
        const fieldNum = tag >> 3;
        offset = newOffset;

        if (wireType === 2) {
            const [length, contentOffset] = readVarint(data, offset);
            const value = data.subarray(contentOffset, contentOffset + length);
            offset = contentOffset + length;

            if (fieldNum === 1) {
                info.accessToken = value.toString();
            } else if (fieldNum === 2) {
                info.tokenType = value.toString();
            } else if (fieldNum === 3) {
                info.refreshToken = value.toString();
            } else if (fieldNum === 4) {
                info.expirySeconds = parseTimestamp(value);
            }
            continue;
        }
        offset = skipField(data, offset, wireType);
    }

    return info;
}

function parseUnifiedOAuthTokenInfo(stateValue: string): LocalTokenInfo {
    const outerRaw = Buffer.from(stateValue.trim(), 'base64');
    const inner = findField(outerRaw, 1);
    if (!inner) {
        throw new Error('Unified oauth outer field not found');
    }

    const sentinel = findField(inner, 1)?.toString();
    if (sentinel !== 'oauthTokenInfoSentinelKey') {
        throw new Error('Unified oauth sentinel mismatch');
    }

    const inner2 = findField(inner, 2);
    if (!inner2) {
        throw new Error('Unified oauth inner field not found');
    }

    const oauthInfoB64 = findField(inner2, 1)?.toString();
    if (!oauthInfoB64) {
        throw new Error('Unified oauth info not found');
    }

    const oauthInfoRaw = Buffer.from(oauthInfoB64.trim(), 'base64');
    return parseOAuthTokenInfo(oauthInfoRaw);
}

// ============================================================================
// Protobuf Encoder (reverse of parse functions above)
// ============================================================================

function writeVarintBytes(value: number): Buffer {
    if (value === 0) {
        return Buffer.from([0]);
    }
    const bytes: number[] = [];
    let v = value;
    while (v > 0) {
        let byte = v & 0x7f;
        v = Math.floor(v / 128); // Math.floor instead of >>> for large numbers
        if (v > 0) {
            byte |= 0x80;
        }
        bytes.push(byte);
    }
    return Buffer.from(bytes);
}

function writeStringField(fieldNum: number, value: string): Buffer {
    const tag = writeVarintBytes((fieldNum << 3) | 2);
    const data = Buffer.from(value, 'utf-8');
    const len = writeVarintBytes(data.length);
    return Buffer.concat([tag, len, data]);
}

function writeMessageField(fieldNum: number, content: Buffer): Buffer {
    const tag = writeVarintBytes((fieldNum << 3) | 2);
    const len = writeVarintBytes(content.length);
    return Buffer.concat([tag, len, content]);
}

function writeVarintField(fieldNum: number, value: number): Buffer {
    const tag = writeVarintBytes((fieldNum << 3) | 0);
    const val = writeVarintBytes(value);
    return Buffer.concat([tag, val]);
}

/**
 * Build OAuthTokenInfo protobuf (reverse of parseOAuthTokenInfo)
 * Fields: 1=accessToken, 2=tokenType, 3=refreshToken, 4=expiry{1=seconds, 2=nanos}, 5=idToken, 6=isGcpTos
 * Aligned with Antigravity-Manager's protobuf::create_oauth_info
 */
function buildOAuthTokenInfoProto(info: LocalTokenInfo): Buffer {
    const parts: Buffer[] = [];
    // Field 1: access_token
    if (info.accessToken) {
        parts.push(writeStringField(1, info.accessToken));
    }
    // Field 2: token_type = "Bearer"
    if (info.tokenType) {
        parts.push(writeStringField(2, info.tokenType));
    }
    // Field 3: refresh_token
    if (info.refreshToken) {
        parts.push(writeStringField(3, info.refreshToken));
    }
    // Field 4: expiry (Timestamp{seconds, nanos=0})
    if (info.expirySeconds !== undefined && info.expirySeconds > 0) {
        const timestampContent = Buffer.concat([
            writeVarintField(1, info.expirySeconds),
            writeVarintField(2, 0), // nanos = 0 (aligned with Manager)
        ]);
        parts.push(writeMessageField(4, timestampContent));
    }
    // Field 5: id_token (optional)
    if (info.idToken) {
        parts.push(writeStringField(5, info.idToken));
    }
    // Field 6: is_gcp_tos (varint boolean, only if true)
    if (info.isGcpTos) {
        parts.push(writeVarintField(6, 1));
    }
    return Buffer.concat(parts);
}

// ============================================================================
// Unified Topic Entry helpers (aligned with Manager's protobuf module)
// ============================================================================

/**
 * Create a unified topic entry: Field 1 = message{ Field 1 = sentinelKey, Field 2 = message{ Field 1 = base64(payload) } }
 * Aligned with Manager's protobuf::create_unified_topic_entry
 */
function createUnifiedTopicEntry(sentinelKey: string, payload: Buffer): Buffer {
    const payloadB64 = payload.toString('base64');
    const row = writeStringField(1, payloadB64);
    const entry = Buffer.concat([
        writeStringField(1, sentinelKey),
        writeMessageField(2, row),
    ]);
    return writeMessageField(1, entry);
}

/**
 * Create a unified state entry (for userStatus/enterprisePreferences).
 * Structure: base64( Field 1 = message{ Field 1 = sentinelKey, Field 2 = message{ Field 1 = base64(payload) } } )
 * Aligned with Manager's protobuf::create_unified_state_entry
 */
function createUnifiedStateEntry(sentinelKey: string, payload: Buffer): string {
    const entry = createUnifiedTopicEntry(sentinelKey, payload);
    return entry.toString('base64');
}

/**
 * Extract the sentinel key from a topic entry's Field 1 sub-message.
 * Returns the key string or undefined if not parseable.
 */
function getTopicEntrySentinelKey(data: Buffer): string | undefined {
    const inner = findField(data, 1);
    return inner?.toString('utf-8');
}

/**
 * Remove a specific topic entry from topic data by sentinel key.
 * Preserves all other entries in the topic.
 * Aligned with Manager's protobuf::remove_unified_topic_entry
 */
function removeUnifiedTopicEntry(data: Buffer, targetKey: string): Buffer {
    const result: Buffer[] = [];
    let offset = 0;

    while (offset < data.length) {
        const startOffset = offset;
        let tag: number;
        let newOffset: number;
        try {
            [tag, newOffset] = readVarint(data, offset);
        } catch {
            break;
        }
        const wireType = tag & 7;
        const fieldNum = tag >> 3;
        const nextOffset = skipField(data, newOffset, wireType);

        let shouldRemove = false;
        if (fieldNum === 1 && wireType === 2) {
            const [length, contentOffset] = readVarint(data, newOffset);
            const entryData = data.subarray(contentOffset, contentOffset + length);
            const entryKey = getTopicEntrySentinelKey(entryData);
            if (entryKey === targetKey) {
                shouldRemove = true;
            }
        }

        if (!shouldRemove) {
            result.push(data.subarray(startOffset, nextOffset));
        }
        offset = nextOffset;
    }

    return Buffer.concat(result);
}

/**
 * Build unified OAuth state value with topic entry preservation.
 * Reads existing topic data, removes old oauthTokenInfoSentinelKey entry, adds new one.
 * This preserves authStateWithContextSentinelKey and other IDE-managed entries.
 * Aligned with Manager's inject_new_format logic.
 */
function buildUnifiedOAuthStatePreserving(info: LocalTokenInfo, existingTopicB64?: string): string {
    // 1. Build OAuthTokenInfo protobuf
    const oauthInfoProto = buildOAuthTokenInfoProto(info);

    // 2. Build new topic entry for oauthTokenInfoSentinelKey
    const newEntry = createUnifiedTopicEntry('oauthTokenInfoSentinelKey', oauthInfoProto);

    // 3. If existing topic data exists, remove old entry and merge
    let topicData: Buffer;
    if (existingTopicB64) {
        try {
            const existingTopic = Buffer.from(existingTopicB64, 'base64');
            const cleaned = removeUnifiedTopicEntry(existingTopic, 'oauthTokenInfoSentinelKey');
            topicData = Buffer.concat([cleaned, newEntry]);
        } catch {
            // If parsing fails, create fresh topic with just this entry
            topicData = newEntry;
        }
    } else {
        topicData = newEntry;
    }

    // 4. Base64 encode the full topic
    return topicData.toString('base64');
}

/**
 * Create minimal UserStatus payload (email at Field 3 + Field 7).
 * Aligned with Manager's protobuf::create_minimal_user_status_payload
 */
function createMinimalUserStatusPayload(email: string): Buffer {
    return Buffer.concat([
        writeStringField(3, email),
        writeStringField(7, email),
    ]);
}

/**
 * Create string value payload for enterprise preferences.
 * Aligned with Manager's protobuf::create_string_value_payload
 */
function createStringValuePayload(value: string): Buffer {
    return writeStringField(3, value);
}

/**
 * Write a value to state.vscdb ItemTable
 */
async function writeStateValueByKey(dbPath: string, key: string, value: string): Promise<void> {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
    }

    const SQL = await getSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    let db: Database | null = null;

    try {
        db = new SQL.Database(fileBuffer);
        db.run('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', [key, value]);

        // Write back to file
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } finally {
        if (db) {
            db.close();
        }
    }
}

/**
 * Write OAuth token info to state.vscdb (unified key)
 * This persists the switched account's token so Antigravity loads it on restart.
 * Now preserves existing topic entries (e.g. authStateWithContextSentinelKey).
 */
export async function writeOAuthTokenToStateDb(info: {
    accessToken: string;
    refreshToken: string;
    tokenType?: string;
    expirySeconds: number;
    idToken?: string;
    isGcpTos?: boolean;
    targetIde?: TargetIdeType;
}): Promise<void> {
    const dbPath = info.targetIde ? getStateDbPathForTarget(info.targetIde) : getAntigravityStateDbPath();
    logger.info(`[LocalAuth] Writing OAuth token to state.vscdb: ${dbPath}`);

    const tokenInfo: LocalTokenInfo = {
        accessToken: info.accessToken,
        refreshToken: info.refreshToken,
        tokenType: info.tokenType || 'Bearer',
        expirySeconds: info.expirySeconds,
        idToken: info.idToken,
        isGcpTos: info.isGcpTos,
    };

    // Read existing topic data to preserve other entries (e.g. authStateWithContextSentinelKey)
    let existingTopicB64: string | undefined;
    try {
        existingTopicB64 = await readStateValueByKey(dbPath, UNIFIED_STATE_KEY);
    } catch {
        // No existing value — will create fresh topic
    }

    const stateValue = buildUnifiedOAuthStatePreserving(tokenInfo, existingTopicB64);
    await writeStateValueByKey(dbPath, UNIFIED_STATE_KEY, stateValue);

    logger.info('[LocalAuth] OAuth token persisted to state.vscdb successfully');
}

/**
 * Write user status to state.vscdb.
 * Creates antigravityUnifiedStateSync.userStatus with email identity.
 * Aligned with Manager's inject_user_status.
 */
async function writeUserStatus(dbPath: string, email: string): Promise<void> {
    const payload = createMinimalUserStatusPayload(email);
    const entryB64 = createUnifiedStateEntry('userStatusSentinelKey', payload);
    await writeStateValueByKey(dbPath, 'antigravityUnifiedStateSync.userStatus', entryB64);
    logger.info(`[LocalAuth] User status written for ${email}`);
}

/**
 * Write enterprise preferences to state.vscdb.
 * Aligned with Manager's inject_enterprise_project_preference.
 */
async function writeEnterprisePreferences(dbPath: string, projectId: string): Promise<void> {
    const payload = createStringValuePayload(projectId);
    const entryB64 = createUnifiedStateEntry('enterpriseGcpProjectId', payload);
    await writeStateValueByKey(dbPath, 'antigravityUnifiedStateSync.enterprisePreferences', entryB64);
    logger.info(`[LocalAuth] Enterprise preferences written: ${projectId}`);
}

/**
 * Clear enterprise preferences from state.vscdb.
 * Aligned with Manager's clear_enterprise_project_preference.
 */
async function clearEnterprisePreferences(dbPath: string): Promise<void> {
    try {
        await deleteStateValueByKey(dbPath, 'antigravityUnifiedStateSync.enterprisePreferences');
        logger.info('[LocalAuth] Enterprise preferences cleared');
    } catch {
        // Ignore if key doesn't exist
    }
}

/**
 * Delete a key from state.vscdb ItemTable.
 */
async function deleteStateValueByKey(dbPath: string, key: string): Promise<void> {
    if (!fs.existsSync(dbPath)) {
        return;
    }

    const SQL = await getSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    let db: Database | null = null;

    try {
        db = new SQL.Database(fileBuffer);
        db.run('DELETE FROM ItemTable WHERE key = ?', [key]);

        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } finally {
        if (db) {
            db.close();
        }
    }
}

/**
 * Write full account state to state.vscdb, aligned with Antigravity-Manager's inject_token.
 * This is the main entry point for account switching — writes all required keys:
 * 1. oauthToken (with topic entry preservation)
 * 2. userStatus (email identity for auth chain)
 * 3. enterprisePreferences (project ID for enterprise accounts)
 * 4. antigravityOnboarding flag
 * 5. Delete stale legacy keys
 */
export async function writeFullAccountState(params: {
    accessToken: string;
    refreshToken: string;
    tokenType?: string;
    expirySeconds: number;
    email: string;
    idToken?: string;
    isGcpTos?: boolean;
    projectId?: string;
    targetIde?: TargetIdeType;
}): Promise<void> {
    const dbPath = params.targetIde ? getStateDbPathForTarget(params.targetIde) : getAntigravityStateDbPath();
    logger.info(`[LocalAuth] writeFullAccountState: target=${dbPath}, email=${params.email}`);

    // 1. Write oauthToken (preserve existing topic entries)
    await writeOAuthTokenToStateDb({
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        tokenType: params.tokenType,
        expirySeconds: params.expirySeconds,
        idToken: params.idToken,
        isGcpTos: params.isGcpTos,
        targetIde: params.targetIde,
    });

    // 2. Write userStatus (email identity for auth chain)
    try {
        await writeUserStatus(dbPath, params.email);
    } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        logger.warn(`[LocalAuth] Failed to write userStatus: ${err}`);
    }

    // 3. Write/clear enterprisePreferences
    try {
        const projectId = params.projectId?.trim();
        if (projectId) {
            await writeEnterprisePreferences(dbPath, projectId);
        } else {
            await clearEnterprisePreferences(dbPath);
        }
    } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        logger.warn(`[LocalAuth] Failed to write enterprisePreferences: ${err}`);
    }

    // 4. Write onboarding flag
    try {
        await writeStateValueByKey(dbPath, 'antigravityOnboarding', 'true');
    } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        logger.warn(`[LocalAuth] Failed to write onboarding flag: ${err}`);
    }

    // 5. Delete stale legacy key (prevent IDE from reading stale UserID)
    try {
        await deleteStateValueByKey(dbPath, 'jetskiStateSync.agentManagerInitState');
    } catch {
        // Non-fatal
    }

    logger.info(`[LocalAuth] writeFullAccountState completed for ${params.email}`);
}

async function hasStateValueForKey(dbPath: string, key: string): Promise<boolean> {
    try {
        await readStateValueByKey(dbPath, key);
        return true;
    } catch {
        return false;
    }
}

async function readUnifiedTokenInfo(dbPath: string): Promise<LocalTokenInfo> {
    const unifiedValue = await readStateValueByKey(dbPath, UNIFIED_STATE_KEY);
    const unifiedInfo = parseUnifiedOAuthTokenInfo(unifiedValue);
    if (!unifiedInfo.refreshToken) {
        throw new Error('Unified state key parsed but refresh_token missing');
    }
    return unifiedInfo;
}

async function readLegacyTokenInfo(dbPath: string): Promise<LocalTokenInfo> {
    const legacyValue = await readStateValueByKey(dbPath, LEGACY_STATE_KEY);
    const raw = Buffer.from(legacyValue.trim(), 'base64');
    const oauthField = findField(raw, 6);
    if (!oauthField) {
        throw new Error('OAuth field not found in legacy state');
    }
    return parseOAuthTokenInfo(oauthField);
}

async function readLocalTokenInfo(): Promise<LocalTokenInfo> {
    const dbPath = getAntigravityStateDbPath();
    logger.info(`[LocalAuth] state.vscdb path: ${dbPath}`);

    const hasUnifiedState = await hasStateValueForKey(dbPath, UNIFIED_STATE_KEY);
    const hasLegacyState = await hasStateValueForKey(dbPath, LEGACY_STATE_KEY);

    if (hasUnifiedState && !hasLegacyState) {
        logger.info(`[LocalAuth] Token state source selected: ${UNIFIED_STATE_KEY}`);
        return readUnifiedTokenInfo(dbPath);
    }

    if (!hasUnifiedState && hasLegacyState) {
        logger.info(`[LocalAuth] Token state source selected: ${LEGACY_STATE_KEY}`);
        return readLegacyTokenInfo(dbPath);
    }

    if (hasUnifiedState && hasLegacyState) {
        logger.info(`[LocalAuth] Token state source selected: ${UNIFIED_STATE_KEY} (both-keys-present)`);
        return readUnifiedTokenInfo(dbPath);
    }

    throw new Error(`No oauth token state key found (${UNIFIED_STATE_KEY} / ${LEGACY_STATE_KEY})`);
}

async function loadCredentialFromStateDb(): Promise<OAuthCredential | null> {
    const tokenInfo = await readLocalTokenInfo();
    if (!tokenInfo.refreshToken) {
        logger.debug('[LocalAuth] No refresh token found in state.vscdb');
        return null;
    }

    const credential = await oauthService.buildCredentialFromRefreshToken(
        tokenInfo.refreshToken,
        undefined,
    );

    if (!credential.email || !credential.accessToken) {
        logger.debug('[LocalAuth] Failed to build credential: missing email or accessToken');
        return null;
    }

    return credential;
}

export async function previewLocalCredential(
    fallbackEmail?: string,
): Promise<{ email: string; exists: boolean }> {
    const tokenInfo = await readLocalTokenInfo();
    if (!tokenInfo.refreshToken) {
        throw new Error('refresh_token not found');
    }

    logger.info(`[LocalAuthImport] Found local refresh token (len=${tokenInfo.refreshToken.length})`);

    const credential = await oauthService.buildCredentialFromRefreshToken(
        tokenInfo.refreshToken,
        fallbackEmail,
    );

    if (!credential.email) {
        throw new Error('无法确定账号邮箱');
    }

    logger.info(`[LocalAuthImport] resolved account: ${credential.email}`);
    pendingLocalCredential = {
        credential,
        createdAt: Date.now(),
    };

    const exists = await credentialStorage.hasAccount(credential.email);
    return { email: credential.email, exists };
}

export async function commitLocalCredential(
    options: { overwrite?: boolean; fallbackEmail?: string } = {},
): Promise<{ email: string; existed: boolean }> {
    let credential: OAuthCredential | null = null;
    const now = Date.now();
    if (pendingLocalCredential && now - pendingLocalCredential.createdAt <= PENDING_CREDENTIAL_TTL_MS) {
        credential = pendingLocalCredential.credential;
    }
    pendingLocalCredential = null;

    if (!credential) {
        const tokenInfo = await readLocalTokenInfo();
        if (!tokenInfo.refreshToken) {
            throw new Error('refresh_token not found');
        }
        credential = await oauthService.buildCredentialFromRefreshToken(
            tokenInfo.refreshToken,
            options.fallbackEmail,
        );
    }

    if (!credential.email) {
        throw new Error('无法确定账号邮箱');
    }

    const existed = await credentialStorage.hasAccount(credential.email);
    if (existed && !options.overwrite) {
        throw new Error('Account already exists');
    }

    await credentialStorage.saveCredential(credential);
    await credentialStorage.clearAccountInvalid(credential.email);
    await credentialStorage.setActiveAccount(credential.email);

    return { email: credential.email, existed };
}

export async function importLocalCredential(fallbackEmail?: string): Promise<{ email: string }> {
    const result = await commitLocalCredential({ overwrite: true, fallbackEmail });
    return { email: result.email };
}

/**
 * 确保本地 Antigravity 账户已导入到 credentialStorage
 * 用于 local 配额模式下通过远端 API 获取配额数据
 * - 如果 credentialStorage 已有有效凭证，直接返回当前账户邮箱
 * - 如果没有，尝试从 state.vscdb 读取并保存到 credentialStorage
 * @returns 账户邮箱或 null
 */
export async function ensureLocalCredentialImported(
    options: { forceReload?: boolean } = {},
): Promise<{ email: string } | null> {
    if (options.forceReload) {
        logger.info('[LocalAuthDebug] Force reload: skip cached credential');
    }

    const instanceDir = getAntigravityUserDataDir();
    if (!options.forceReload && !instanceDir) {
        const hasValid = await credentialStorage.hasValidCredential();
        if (hasValid) {
            const activeEmail = await credentialStorage.getActiveAccount();
            if (activeEmail) {
                logger.debug(`[LocalAuth] Using existing credential: ${activeEmail}`);
                return { email: activeEmail };
            }
        }
    }

    try {
        const credential = await loadCredentialFromStateDb();
        if (!credential) {
            return null;
        }

        // 保存到 credentialStorage（自动导入）
        await credentialStorage.saveCredential(credential);
        logger.info(`[LocalAuth] resolved account: ${credential.email}`);
        logger.info(`[LocalAuth] Auto-imported credential for ${credential.email}`);
        return { email: credential.email };
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.debug(`[LocalAuth] Failed to import local credential: ${err.message}`);
        return null;
    }
}

export async function debugLocalCredentialImport(): Promise<{ email?: string; dbPath: string }> {
    logger.info('[LocalAuthDebug] Starting local credential debug...');
    const dbPath = getAntigravityStateDbPath();
    logger.info(`[LocalAuthDebug] Using state.vscdb: ${dbPath}`);
    logger.info(`[LocalAuthDebug] override user-data-dir: ${getAntigravityUserDataDir() ?? 'null'}`);
    const result = await ensureLocalCredentialImported({ forceReload: true });
    logger.info(`[LocalAuthDebug] Result: ${result?.email ?? 'null'}`);
    return { email: result?.email, dbPath };
}
