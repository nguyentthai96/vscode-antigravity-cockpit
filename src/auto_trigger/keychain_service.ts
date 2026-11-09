/**
 * OS Keyring integration for Antigravity IDE Language Server auth.
 *
 * The IDE Language Server (Go binary) stores its OAuth token in the OS keyring
 * under service="gemini", account="antigravity" as a JSON blob.
 *
 * Platform support:
 * - macOS: Keychain via `/usr/bin/security` (go-keyring-base64 prefix)
 * - Linux: D-Bus Secret Service (gnome-keyring) via python3 (raw JSON)
 * - Windows: Not yet supported (no-op)
 *
 * Keychain payload format:
 * ```
 * {
 *   "token": { access_token, token_type, refresh_token, expiry, expires_in },
 *   "auth_method": "consumer",
 *   "id_token_email": "<email>",
 *   "writer_id": "<unique id>"
 * }
 * ```
 *
 * macOS stores as: go-keyring-base64:<base64(JSON)>
 * Linux stores as: raw JSON
 */

import { execFile, spawn } from 'child_process';
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

function isMacOS(): boolean {
    return process.platform === 'darwin';
}

function isLinux(): boolean {
    return process.platform === 'linux';
}

/**
 * Read current Keychain token.
 * Returns null if entry doesn't exist or on unsupported platforms.
 */
export async function readKeychainToken(): Promise<KeychainTokenPayload | null> {
    if (isMacOS()) {
        return readKeychainTokenMacOS();
    }
    if (isLinux()) {
        return readKeychainTokenLinux();
    }
    return null;
}

async function readKeychainTokenMacOS(): Promise<KeychainTokenPayload | null> {
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
        if (msg.includes('could not be found') || msg.includes('SecKeychainSearchCopyNext')) {
            logger.info('[Keychain] No existing gemini keychain entry');
        } else {
            logger.warn('[Keychain] Failed to read: ' + msg);
        }
        return null;
    }
}

/**
 * Read token from Linux D-Bus Secret Service (gnome-keyring).
 * go_keyring on Linux stores raw JSON (no base64 prefix).
 */
async function readKeychainTokenLinux(): Promise<KeychainTokenPayload | null> {
    try {
        const script = `
import dbus, json, sys
bus = dbus.SessionBus()
svc = dbus.Interface(bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets'), 'org.freedesktop.Secret.Service')
items, _ = svc.SearchItems({'service': '${KEYCHAIN_SERVICE}', 'username': '${KEYCHAIN_ACCOUNT}'})
if not items:
    sys.exit(1)
_, session = svc.OpenSession('plain', dbus.String(''))
item = bus.get_object('org.freedesktop.secrets', items[0])
secret = dbus.Interface(item, 'org.freedesktop.Secret.Item').GetSecret(session)
print(bytes(secret[2]).decode('utf-8'))
`;
        const { stdout } = await execFileAsync('python3', ['-c', script], { timeout: 5000 });
        const raw = stdout.trim();
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as KeychainTokenPayload;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.info('[Keychain] Linux secret read: ' + msg);
        return null;
    }
}

/**
 * Write token to OS Keyring.
 */
export async function writeKeychainToken(payload: KeychainTokenPayload): Promise<boolean> {
    if (isMacOS()) {
        return writeKeychainTokenMacOS(payload);
    }
    if (isLinux()) {
        return writeKeychainTokenLinux(payload);
    }
    logger.info('[Keychain] Skipping: unsupported platform ' + process.platform);
    return false;
}

async function writeKeychainTokenMacOS(payload: KeychainTokenPayload): Promise<boolean> {
    try {
        const json = JSON.stringify(payload);
        const b64 = Buffer.from(json).toString('base64');
        const keychainValue = 'go-keyring-base64:' + b64;

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

        logger.info('[Keychain] macOS token written for ' + payload.id_token_email);
        return true;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Keychain] macOS write failed: ' + msg);
        return false;
    }
}

/**
 * Write token to Linux D-Bus Secret Service (gnome-keyring).
 * go_keyring on Linux stores raw JSON with attributes:
 *   service=gemini, username=antigravity, xdg:schema=org.freedesktop.Secret.Generic
 */
async function writeKeychainTokenLinux(payload: KeychainTokenPayload): Promise<boolean> {
    try {
        const jsonStr = JSON.stringify(payload);
        // Use python3 + dbus to write to gnome-keyring
        // This matches the exact format go_keyring uses on Linux
        const script = `
import dbus, sys

bus = dbus.SessionBus()
svc_obj = bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets')
svc = dbus.Interface(svc_obj, 'org.freedesktop.Secret.Service')

# Open a plain-text session
_, session = svc.OpenSession('plain', dbus.String(''))

# Delete existing item if present
items, _ = svc.SearchItems({'service': '${KEYCHAIN_SERVICE}', 'username': '${KEYCHAIN_ACCOUNT}'})
for item_path in items:
    item = bus.get_object('org.freedesktop.secrets', item_path)
    dbus.Interface(item, 'org.freedesktop.Secret.Item').Delete()

# Create new item in the default collection
collection = bus.get_object('org.freedesktop.secrets', '/org/freedesktop/secrets/aliases/default')
coll_iface = dbus.Interface(collection, 'org.freedesktop.Secret.Collection')

secret_value = dbus.Struct(
    (
        dbus.ObjectPath(session),
        dbus.ByteArray(b''),
        dbus.ByteArray(sys.stdin.buffer.read()),
        dbus.String('text/plain'),
    ),
    signature='oayays',
)

properties = {
    'org.freedesktop.Secret.Item.Label': "Password for '${KEYCHAIN_ACCOUNT}' on '${KEYCHAIN_SERVICE}'",
    'org.freedesktop.Secret.Item.Attributes': dbus.Dictionary({
        'service': '${KEYCHAIN_SERVICE}',
        'username': '${KEYCHAIN_ACCOUNT}',
        'xdg:schema': 'org.freedesktop.Secret.Generic',
    }, signature='ss'),
}

item_path, prompt_path = coll_iface.CreateItem(properties, secret_value, True)
if str(prompt_path) != '/':
    prompt = dbus.Interface(bus.get_object('org.freedesktop.secrets', prompt_path), 'org.freedesktop.Secret.Prompt')
    prompt.Perform('')

print('OK')
`;
        // Use spawn to pipe JSON payload via stdin (execFile can't do stdin)
        const result = await new Promise<boolean>((resolve) => {
            const proc = spawn('python3', ['-c', script], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 5000,
            });

            let stdoutData = '';
            let stderrData = '';

            proc.stdout.on('data', (data: Buffer) => { stdoutData += data.toString(); });
            proc.stderr.on('data', (data: Buffer) => { stderrData += data.toString(); });

            proc.on('close', (code: number) => {
                if (code === 0 && stdoutData.trim().includes('OK')) {
                    resolve(true);
                } else {
                    logger.warn('[Keychain] Linux write process exited ' + code + ': ' + stderrData);
                    resolve(false);
                }
            });

            proc.on('error', (err: Error) => {
                logger.warn('[Keychain] Linux write spawn error: ' + err.message);
                resolve(false);
            });

            proc.stdin.write(jsonStr);
            proc.stdin.end();
        });

        if (result) {
            logger.info('[Keychain] Linux token written for ' + payload.id_token_email);
        }
        return result;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('[Keychain] Linux write failed: ' + msg);
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
    const expiry = expiryDate.toISOString().replace('Z', sign + hours + ':' + minutes);

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
        writer_id: 'cockpit_switch_' + Date.now(),
    };
}

/**
 * High-level: Update OS Keyring for account switch.
 * Called from AccountSwitchService after writeFullAccountStateToAllTargets.
 *
 * Supported platforms: macOS (Keychain), Linux (D-Bus Secret Service / gnome-keyring)
 * @returns true if keyring was updated, false otherwise
 */
export async function updateKeychainForAccountSwitch(params: {
    accessToken: string;
    refreshToken: string;
    email: string;
    expirySeconds: number;
}): Promise<boolean> {
    if (!isMacOS() && !isLinux()) {
        return false;
    }

    try {
        const payload = buildKeychainPayload(params);
        const success = await writeKeychainToken(payload);

        if (success) {
            logger.info('[Keychain] Account switch: keyring updated to ' + params.email +
                ' (platform=' + process.platform + ')');
        }

        return success;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn('[Keychain] Account switch keyring update failed (non-fatal): ' + msg);
        // Non-fatal: state.vscdb is already updated, keyring is bonus
        return false;
    }
}

