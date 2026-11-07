/**
 * macOS Keychain integration for Antigravity IDE Language Server auth.
 *
 * The IDE Language Server (Go binary) stores its OAuth token in macOS Keychain
 * under service="gemini", account="antigravity" as a go-keyring-base64 encoded
 * JSON blob. This module updates that entry so the Language Server picks up
 * the switched account on its next token read.
 *
 * Keychain payload format:
 * ```
 * go-keyring-base64:<base64({
 *   "token": { access_token, token_type, refresh_token, expiry, expires_in },
 *   "auth_method": "consumer",
 *   "id_token_email": "<email>",
 *   "writer_id": "<unique id>"
 * })>
 * ```
 *
 * Only supported on macOS. On other platforms, this module is a no-op.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../shared/log_service';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'gemini';
const KEYCHAIN_ACCOUNT = 'antigravity';
const SECURITY_CMD = '/usr/bin/security';

/**
 * Keychain token payload matching the Go Language Server's expected format.
 */
export interface KeychainTokenPayload {
    token: {
        access_token: string;
        token_type: string;
        refresh_token: string;
        expiry: string;
        expires_in: number;
    };
    auth_method: string;
    id_token_email: string;
    writer_id: string;
}

/**
 * Check if running on macOS (only platform with Keychain support).
 */
function isMacOS(): boolean {
    return process.platform === 'darwin';
}

/**
 * Read current Keychain token.
 * Returns null if entry doesn't exist or on non-macOS platforms.
 */
export async function readKeychainToken(): Promise<KeychainTokenPayload | null> {
    if (!isMacOS()) {
        return null;
    }

    try {
        const { stdout } = await execFileAsync(SECURITY_CMD, [
            'find-generic-password',
            '-s', KEYCHAIN_SERVICE,
            '-a', KEYCHAIN_ACCOUNT,
            '-w',
        ]);

        const raw = stdout.trim();
        if (!raw.startsWith('go-keyring-base64:')) {
            logger.warn('[Keychain] Unexpected keychain format (missing go-keyring-base64 prefix)');
            return null;
        }

        const b64 = raw.replace('go-keyring-base64:', '');
        const json = Buffer.from(b64, 'base64').toString('utf-8');
        return JSON.parse(json) as KeychainTokenPayload;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        // Item not found is expected for first-time setup
        if (msg.includes('could not be found') || msg.includes('SecKeychainSearchCopyNext')) {
            logger.info('[Keychain] No existing gemini keychain entry');
        } else {
            logger.warn(`[Keychain] Failed to read: ${msg}`);
        }
        return null;
    }
}

/**
 * Write token to macOS Keychain (service=gemini, account=antigravity).
 * Uses `security add-generic-password -U` to update or create.
 *
 * This is a no-op on non-macOS platforms.
 */
export async function writeKeychainToken(payload: KeychainTokenPayload): Promise<boolean> {
    if (!isMacOS()) {
        logger.info('[Keychain] Skipping: not macOS');
        return false;
    }

    try {
        const json = JSON.stringify(payload);
        const b64 = Buffer.from(json).toString('base64');
        const keychainValue = `go-keyring-base64:${b64}`;

        // Delete existing entry first (ignore errors if not exists)
        try {
            await execFileAsync(SECURITY_CMD, [
                'delete-generic-password',
                '-s', KEYCHAIN_SERVICE,
                '-a', KEYCHAIN_ACCOUNT,
            ]);
        } catch {
            // Entry may not exist yet — that's OK
        }

        // Add new entry
        await execFileAsync(SECURITY_CMD, [
            'add-generic-password',
            '-s', KEYCHAIN_SERVICE,
            '-a', KEYCHAIN_ACCOUNT,
            '-w', keychainValue,
            '-U', // Update if exists
        ]);

        logger.info(`[Keychain] Token written for ${payload.id_token_email}`);
        return true;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[Keychain] Failed to write: ${msg}`);
        return false;
    }
}

/**
 * Build a Keychain payload from switch account parameters.
 * Preserves writer_id from existing entry if available.
 */
export function buildKeychainPayload(params: {
    accessToken: string;
    refreshToken: string;
    email: string;
    expirySeconds: number;
    expiresIn?: number;
}): KeychainTokenPayload {
    const expiryDate = new Date(params.expirySeconds * 1000);
    // Format with timezone offset like Go does (e.g., "2026-11-07T10:37:21.228021+07:00")
    const tzOffset = -expiryDate.getTimezoneOffset();
    const sign = tzOffset >= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
    const minutes = String(Math.abs(tzOffset) % 60).padStart(2, '0');
    const expiry = expiryDate.toISOString().replace('Z', `${sign}${hours}:${minutes}`);

    return {
        token: {
            access_token: params.accessToken,
            token_type: 'Bearer',
            refresh_token: params.refreshToken,
            expiry,
            expires_in: params.expiresIn ?? 3599,
        },
        auth_method: 'consumer',
        id_token_email: params.email,
        writer_id: `cockpit_switch_${Date.now()}`,
    };
}

/**
 * High-level: Update Keychain for account switch.
 * Called from AccountSwitchService after writeFullAccountStateToAllTargets.
 *
 * @returns true if Keychain was updated, false otherwise (non-macOS or error)
 */
export async function updateKeychainForAccountSwitch(params: {
    accessToken: string;
    refreshToken: string;
    email: string;
    expirySeconds: number;
}): Promise<boolean> {
    if (!isMacOS()) {
        return false;
    }

    try {
        const payload = buildKeychainPayload(params);
        const success = await writeKeychainToken(payload);

        if (success) {
            logger.info(`[Keychain] Account switch: Keychain updated to ${params.email}`);
        }

        return success;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`[Keychain] Account switch Keychain update failed (non-fatal): ${msg}`);
        // Non-fatal: state.vscdb is already updated, Keychain is bonus
        return false;
    }
}
