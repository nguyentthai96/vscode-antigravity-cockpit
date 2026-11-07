# Tài liệu thay đổi: Keychain + Auto-reload cho Account Switch

> **Version**: 2.2.51
> **Date**: 2026-11-07
> **Status**: ✅ Tested macOS | 🔄 Cần test Linux

---

## 1. Tóm tắt thay đổi

### Vấn đề
Cockpit switch account chỉ update **state.vscdb** → IDE Settings vẫn hiện email cũ.
User phải restart IDE mới thấy email mới.

### Giải pháp (3 thay đổi)
1. **Keychain update** — ghi token mới vào OS Keyring (nơi Language Server đọc)
2. **Auto-reload window** — tự động reload IDE sau switch (800ms delay)
3. **Runtime đã OK** — `setOAuthTokenInfo()` đã push token vào LS memory, AI tools dùng ngay

### Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│              ACCOUNT SWITCH (v2.2.51)                       │
│                                                             │
│  ① setOAuthTokenInfo()  → LS runtime memory                │
│     ✅ AI tools dùng token mới NGAY LẬP TỨC               │
│                                                             │
│  ② writeFullAccountState() → state.vscdb (IDE + Classic)   │
│     ✅ Persisted cho lần mở IDE tiếp theo                  │
│                                                             │
│  ③ updateKeychainForAccountSwitch() → OS Keyring  ← MỚI   │
│     macOS: Keychain (service=gemini, account=antigravity)   │
│     Linux: Secret Service (D-Bus / GNOME Keyring)           │
│     ✅ LS đọc đúng token khi reload                        │
│                                                             │
│  ④ credentialStorage.setActiveAccount()                     │
│     ✅ Cockpit internal state                               │
│                                                             │
│  ⑤ Auto-reload window (800ms delay)              ← MỚI    │
│     ✅ IDE Settings UI + account icon tự cập nhật          │
│     ✅ Không cần user chọn "Reload Now"                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Files Changed

### 2.1. NEW: `src/auto_trigger/keychain_service.ts`

Module mới — đọc/ghi OS Keyring cho Language Server auth.

| Function | Mô tả |
|----------|-------|
| `readKeychainToken()` | Đọc token hiện tại từ Keyring |
| `writeKeychainToken(payload)` | Ghi token mới |
| `buildKeychainPayload(params)` | Build JSON payload từ switch params |
| `updateKeychainForAccountSwitch(params)` | High-level entry point |

**Keyring payload format** (Go Language Server expected):
```json
{
  "token": {
    "access_token": "ya29...",
    "token_type": "Bearer",
    "refresh_token": "1//0g...",
    "expiry": "2026-11-07T10:37:21.228021+07:00",
    "expires_in": 3599
  },
  "auth_method": "consumer",
  "id_token_email": "user@example.com",
  "writer_id": "cockpit_switch_1730960XXX"
}
```

**Platform support:**
| Platform | CLI Tool | Implementation |
|----------|----------|---------------|
| macOS | `/usr/bin/security` | ✅ Done |
| Linux | `secret-tool` | 🔄 Cần bổ sung |
| Windows | N/A | No-op (return false) |

### 2.2. MODIFIED: `src/services/accountSwitchService.ts`

Thêm Keychain update step (lines 324-346):

```diff
+ // Update macOS Keychain so IDE Language Server picks up the new account.
+ try {
+     const { updateKeychainForAccountSwitch } = await import(
+         '../auto_trigger/keychain_service'
+     );
+     const keychainOk = await updateKeychainForAccountSwitch({
+         accessToken,
+         refreshToken: credential.refreshToken,
+         email: resolvedEmail,
+         expirySeconds: Math.floor(expiryMs / 1000),
+     });
+ } catch (keychainError) {
+     // Non-fatal: macOS Keychain is a bonus layer for IDE Settings sync
+ }
```

### 2.3. MODIFIED: `src/controller/message_controller.ts`

Auto-reload thay manual prompt (lines 1085-1097):

```diff
- // Seamless mode: prompt user to reload so IDE account icon updates
- const reloadAction = 'Reload Now';
- const laterAction = 'Later';
- const choice = await vscode.window.showInformationMessage(
-     `Account switched to ${switchedEmail}. Reload window to...?`,
-     reloadAction, laterAction,
- );
- if (choice === reloadAction) {
-     vscode.commands.executeCommand('workbench.action.reloadWindow');
- }

+ // Seamless mode: auto-reload window for UI sync
+ vscode.window.showInformationMessage(
+     `Account switched to ${switchedEmail}. Reloading window...`,
+ );
+ setTimeout(() => {
+     vscode.commands.executeCommand('workbench.action.reloadWindow');
+ }, 800);
```

---

## 3. Phát hiện quan trọng: Token runtime vs UI

> [!IMPORTANT]
> `setOAuthTokenInfo()` đã update token trong LS runtime **ngay lập tức**.
> AI tools dùng token mới cho request tiếp theo **không cần** reload.
> Reload window chỉ để **UI layer** (IDE Settings, account icon) cập nhật.

**Xác minh:** Gọi `GetUserStatus` API sau switch (trước reload):
```json
{
  "userStatus": {
    "name": "Đỗ Phúc Thịnh (TP, P.DVNH, KCN)",
    "email": "thinhdp@vnpay.vn"     ← LS runtime đã cập nhật!
  }
}
```

---

## 4. Hướng dẫn test trên Linux

### 4.1. Pre-requisites
```bash
# Install secret-tool (GNOME Keyring CLI)
sudo apt-get install libsecret-tools

# Verify Secret Service is running
dbus-send --session --dest=org.freedesktop.secrets \
  --print-reply /org/freedesktop/secrets \
  org.freedesktop.DBus.Peer.Ping
```

### 4.2. Kiểm tra Keyring hiện tại
```bash
# Read current LS token
secret-tool lookup service gemini username antigravity

# Decode
secret-tool lookup service gemini username antigravity | \
  sed 's/go-keyring-base64://' | base64 -d | python3 -m json.tool
```

### 4.3. Code cần bổ sung cho Linux

Trong `keychain_service.ts`, thêm Linux support:

```typescript
import { spawn } from 'child_process';

// Platform router
export async function writeKeychainToken(payload: KeychainTokenPayload): Promise<boolean> {
    if (process.platform === 'darwin') return writeKeychainTokenMacOS(payload);
    if (process.platform === 'linux')  return writeKeychainTokenLinux(payload);
    return false; // Windows: no-op
}

// Linux: secret-tool (D-Bus Secret Service)
async function writeKeychainTokenLinux(payload: KeychainTokenPayload): Promise<boolean> {
    const json = JSON.stringify(payload);
    const b64 = Buffer.from(json).toString('base64');
    const value = `go-keyring-base64:${b64}`;

    // Delete existing
    try {
        await execFileAsync('secret-tool', [
            'clear', 'service', 'gemini', 'username', 'antigravity',
        ]);
    } catch { /* may not exist */ }

    // Write new (reads from stdin)
    return new Promise((resolve) => {
        const child = spawn('secret-tool', [
            'store', '--label=gemini',
            'service', 'gemini', 'username', 'antigravity',
        ]);
        child.stdin.write(value);
        child.stdin.end();
        child.on('close', (code) => {
            logger.info(`[Keychain] Linux secret-tool store: exit=${code}`);
            resolve(code === 0);
        });
        child.on('error', (err) => {
            logger.warn(`[Keychain] Linux secret-tool error: ${err.message}`);
            resolve(false);
        });
    });
}

async function readKeychainTokenLinux(): Promise<KeychainTokenPayload | null> {
    try {
        const { stdout } = await execFileAsync('secret-tool', [
            'lookup', 'service', 'gemini', 'username', 'antigravity',
        ]);
        const raw = stdout.trim();
        if (!raw.startsWith('go-keyring-base64:')) return null;
        const b64 = raw.replace('go-keyring-base64:', '');
        return JSON.parse(Buffer.from(b64, 'base64').toString());
    } catch { return null; }
}
```

### 4.4. Build & Test
```bash
# Build
cd vscode-antigravity-cockpit
npm install && npm run build

# Package
npx -y @vscode/vsce package --no-dependencies

# Install
~/.antigravity-ide/antigravity-ide/bin/antigravity-ide \
  --install-extension ./antigravity-cockpit-2.2.51.vsix --force
```

### 4.5. Test checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Build thành công | ✅ No errors |
| 2 | Switch account qua Cockpit | ✅ Success message |
| 3 | Window auto-reload (800ms) | ✅ IDE reload tự động |
| 4 | IDE Settings hiển thị email mới | ✅ Sau reload |
| 5 | `secret-tool lookup` trả token mới | ✅ email đúng |
| 6 | AI request dùng account mới | ✅ Không cần action thêm |

---

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auto-reload gián đoạn workflow | Medium | 800ms delay hiện message trước |
| secret-tool không có trên Linux | Medium | `isMacOS()` guard, non-fatal try/catch |
| Keychain permission prompt | Low | Login keychain đã unlocked |
| Race condition write | Very Low | Sequential, single writer |

---

## 6. Backward Compatibility

- ✅ Không thêm dependency mới (built-in `child_process`)
- ✅ Keychain update là non-fatal (`try/catch`)
- ✅ Non-macOS platforms: no-op, fallback graceful
- ✅ `setOAuthTokenInfo()` vẫn hoạt động như trước
