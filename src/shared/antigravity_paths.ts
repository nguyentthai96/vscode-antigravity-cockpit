import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let overrideUserDataDir: string | null = null;
let currentRemoteName: string | null = null;
let cachedWslWindowsAppDataDir: string | null | undefined;
let cachedWslWindowsUserProfileDir: string | null | undefined;
let cachedWslRuntimeDetected: boolean | undefined;

function resolveWslWindowsPathFromEnv(varName: 'APPDATA' | 'USERPROFILE'): string {
    const windowsValue = childProcess.execFileSync(
        'cmd.exe',
        ['/d', '/u', '/c', 'echo', `%${varName}%`],
        { encoding: 'utf16le' },
    ).replace(/^\uFEFF/, '').trim();

    if (!windowsValue || windowsValue.includes(`%${varName}%`)) {
        throw new Error(`Unexpected ${varName} output: ${windowsValue || '<empty>'}`);
    }

    const wslPath = childProcess.execFileSync(
        'wslpath',
        ['-u', windowsValue],
        { encoding: 'utf8' },
    ).trim();

    if (!wslPath) {
        throw new Error(`wslpath returned empty path for ${varName}`);
    }

    return wslPath;
}

export function setAntigravityUserDataDir(dir: string | null): void {
    overrideUserDataDir = dir && dir.trim().length > 0 ? dir : null;
}

export function setAntigravityRemoteName(remoteName: string | null): void {
    currentRemoteName = remoteName && remoteName.trim().length > 0 ? remoteName : null;
    cachedWslWindowsAppDataDir = undefined;
    cachedWslWindowsUserProfileDir = undefined;
    cachedWslRuntimeDetected = undefined;
}

export function getAntigravityUserDataDir(): string | null {
    return overrideUserDataDir;
}

function detectWslRuntime(): boolean {
    if (cachedWslRuntimeDetected !== undefined) {
        return cachedWslRuntimeDetected;
    }

    if (process.platform !== 'linux') {
        cachedWslRuntimeDetected = false;
        return cachedWslRuntimeDetected;
    }

    if (process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME) {
        cachedWslRuntimeDetected = true;
        return cachedWslRuntimeDetected;
    }

    try {
        const kernelRelease = childProcess.execFileSync(
            'uname',
            ['-r'],
            { encoding: 'utf8' },
        ).trim().toLowerCase();
        cachedWslRuntimeDetected = kernelRelease.includes('microsoft');
        return cachedWslRuntimeDetected;
    } catch {
        cachedWslRuntimeDetected = false;
        return cachedWslRuntimeDetected;
    }
}

function resolveWslWindowsAppDataDir(): string {
    if (cachedWslWindowsAppDataDir !== undefined) {
        if (cachedWslWindowsAppDataDir) {
            return cachedWslWindowsAppDataDir;
        }
        throw new Error('Failed to resolve Windows APPDATA path from WSL');
    }

    try {
        // `cmd.exe /u` makes the built-in `echo` emit UTF-16LE, which preserves
        // non-ASCII Windows profile paths when this code runs inside WSL.
        const wslAppData = resolveWslWindowsPathFromEnv('APPDATA');
        cachedWslWindowsAppDataDir = wslAppData;
        return wslAppData;
    } catch (error) {
        cachedWslWindowsAppDataDir = null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to resolve Windows APPDATA path from WSL: ${message}`);
    }
}

function resolveWslWindowsUserProfileDir(): string {
    if (cachedWslWindowsUserProfileDir !== undefined) {
        if (cachedWslWindowsUserProfileDir) {
            return cachedWslWindowsUserProfileDir;
        }
        throw new Error('Failed to resolve Windows USERPROFILE path from WSL');
    }

    try {
        const wslUserProfile = resolveWslWindowsPathFromEnv('USERPROFILE');
        cachedWslWindowsUserProfileDir = wslUserProfile;
        return wslUserProfile;
    } catch (error) {
        cachedWslWindowsUserProfileDir = null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to resolve Windows USERPROFILE path from WSL: ${message}`);
    }
}

export function isAntigravityWslRemote(): boolean {
    if (currentRemoteName === 'wsl') {
        return true;
    }

    if (currentRemoteName) {
        return false;
    }

    return detectWslRuntime();
}

export function getCockpitToolsSharedDir(): string {
    if (isAntigravityWslRemote()) {
        return path.posix.join(resolveWslWindowsUserProfileDir(), '.antigravity_cockpit');
    }
    return path.join(os.homedir(), '.antigravity_cockpit');
}

/**
 * Target IDE type for state.vscdb path resolution.
 * - 'classic': Antigravity (classic VS Code fork)
 * - 'ide': Antigravity IDE (standalone IDE)
 */
export type TargetIdeType = 'classic' | 'ide';

/**
 * Folder name candidates for each target IDE.
 * Manager uses: classic → ['Antigravity'], ide → ['Antigravity IDE', 'antigravity-ide', 'antigravity_ide']
 */
function getFolderNamesForTarget(targetIde: TargetIdeType): string[] {
    if (targetIde === 'ide') {
        return ['Antigravity IDE', 'antigravity-ide', 'antigravity_ide'];
    }
    return ['Antigravity'];
}

/**
 * Get all candidate state.vscdb paths for a target IDE (cross-platform).
 * Aligned with Antigravity-Manager's db::get_all_candidate_db_paths logic.
 */
export function getAllCandidateDbPaths(targetIde: TargetIdeType): string[] {
    const paths: string[] = [];
    const folderNames = getFolderNamesForTarget(targetIde);

    if (isAntigravityWslRemote()) {
        try {
            const appDataDir = resolveWslWindowsAppDataDir();
            for (const folder of folderNames) {
                paths.push(path.posix.join(appDataDir, folder, 'User', 'globalStorage', 'state.vscdb'));
            }
        } catch {
            // WSL resolution failed, skip
        }
        return paths;
    }

    if (overrideUserDataDir) {
        paths.push(path.join(overrideUserDataDir, 'User', 'globalStorage', 'state.vscdb'));
        return paths;
    }

    const homeDir = os.homedir();
    if (process.platform === 'darwin') {
        for (const folder of folderNames) {
            paths.push(path.join(homeDir, 'Library', 'Application Support', folder, 'User', 'globalStorage', 'state.vscdb'));
        }
    } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
        for (const folder of folderNames) {
            paths.push(path.join(appData, folder, 'User', 'globalStorage', 'state.vscdb'));
        }
    } else {
        for (const folder of folderNames) {
            paths.push(path.join(homeDir, '.config', folder, 'User', 'globalStorage', 'state.vscdb'));
        }
    }

    return paths;
}

/**
 * Resolve the best state.vscdb path for a target IDE.
 * Tries all candidate paths and returns the first one that exists on disk.
 * Falls back to the first candidate if none exists.
 */
export function getStateDbPathForTarget(targetIde: TargetIdeType): string {
    const candidates = getAllCandidateDbPaths(targetIde);
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    // Fall back to first candidate (may not exist yet)
    return candidates[0];
}

/**
 * Get Antigravity state.vscdb path (default: classic target).
 * For backward compatibility, this targets Antigravity classic.
 * Use getStateDbPathForTarget('ide') for Antigravity IDE.
 */
export function getAntigravityStateDbPath(): string {
    return getStateDbPathForTarget('classic');
}
