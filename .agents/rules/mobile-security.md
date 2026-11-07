---
trigger: model_decision
description: "Mobile security rules for Android and iOS applications — runtime integrity, jailbreak/root detection, secure storage, certificate pinning, anti-tampering, and platform-specific hardening."
---

# Mobile Security Rules (Android / iOS)

> Security standards for mobile banking and financial applications on Android and iOS platforms.

## Principles

- Runtime integrity — detect and respond to compromised environments
- No "remember password" — credentials must never be persisted in plaintext
- Session timeout — banking features expire after **180 seconds** of inactivity
- Certificate pinning — reject connections to untrusted endpoints
- Anti-tampering — protect against hooking, debugging, and reverse engineering

## Rules

### General (Android & iOS)

- **Jailbreak / Root detection**: check at app launch and continuously at runtime; refuse operation if detected
- **No "remember password" feature** for banking/financial flows — session expires after **180 seconds** of inactivity
- **Certificate pinning**: pin the public key or certificate leaf; reject all other TLS endpoints
- Add **anti-hook**, **anti-Frida**, and **anti-debug** protections for all sensitive flows

### Android

- **Secure storage**: store authentication credentials in **Android Keystore** — never in `SharedPreferences`, plain files, or SQLite without encryption
- **Screen protection**: set `FLAG_SECURE` on every screen displaying OTP, balance, or payment confirmation (prevents screenshots and screen recording)
- **Tapjacking prevention**: enable `android:filterTouchesWhenObscured="true"` on all sensitive input views
- **Device ID**: never use `IMEI` or `MAC address` as a device identifier — use `Installation UUID` stored in Keystore or attestation APIs
- **PendingIntent**: always declare with `FLAG_IMMUTABLE` to prevent intent hijacking

```kotlin
// Correct: FLAG_IMMUTABLE prevents intent hijacking
val pendingIntent = PendingIntent.getActivity(
    context, 0, intent,
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
)
```

```kotlin
// FLAG_SECURE on sensitive screens
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE)
}
```

### iOS

- **Secure storage**: store all authentication credentials in **Keychain** with accessibility attribute `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — never in `UserDefaults` or plain files
- **ATS (App Transport Security)**: never set `NSAllowsArbitraryLoads = true` in production — all connections must use TLS 1.2+
- **OTP input field**: set `textContentType = .oneTimeCode` and disable `autocorrect` / `autocapitalization`
- **App Switcher privacy**: add a blur/overlay layer when the app enters background to prevent OTP or balance from being visible in the App Switcher

```swift
// Correct Keychain accessibility
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    kSecValueData as String: tokenData
]
```

```swift
// App Switcher privacy blur
func applicationWillResignActive(_ application: UIApplication) {
    privacyOverlayView.isHidden = false
}
func applicationDidBecomeActive(_ application: UIApplication) {
    privacyOverlayView.isHidden = true
}
```

```swift
// OTP text field
otpTextField.textContentType = .oneTimeCode
otpTextField.autocorrectionType = .no
otpTextField.autocapitalizationType = .none
```

### Network Security

- Enforce **certificate pinning** for all API endpoints; handle pin rotation gracefully
- Use **TLS 1.2 minimum** (TLS 1.3 preferred) for all connections
- Validate the full certificate chain — do not disable hostname verification
- Fail closed on network security errors: display generic error, do not retry silently

### Threat Mitigation (Mobile-specific)

| Threat | Mitigation |
|--------|------------|
| Jailbreak / Root | Runtime detection + refuse critical operations |
| Screen capture / recording | `FLAG_SECURE` (Android) + overlay on background (iOS) |
| Tapjacking | `filterTouchesWhenObscured` (Android) |
| Credential theft | Keystore (Android) / Keychain with `WhenUnlockedThisDeviceOnly` (iOS) |
| MitM / SSL interception | Certificate pinning + ATS enforcement |
| Reverse engineering | ProGuard/R8 obfuscation (Android) + Bitcode disabled (iOS) |
| Dynamic instrumentation | Anti-Frida / anti-hook checks at runtime |
| Intent hijacking | `FLAG_IMMUTABLE` on all `PendingIntent` |
| OTP leakage | `textContentType=.oneTimeCode` + blur on background |

## Anti-Patterns

- ❌ Storing tokens or passwords in `SharedPreferences` (Android) or `UserDefaults` (iOS)
- ❌ Allowing screenshots on OTP / balance / payment screens
- ❌ Using `NSAllowsArbitraryLoads = true` in production `Info.plist`
- ❌ No jailbreak/root detection in banking/financial apps
- ❌ Using `IMEI` or `MAC address` as device identifier
- ❌ `PendingIntent` without `FLAG_IMMUTABLE` (Android 12+ requirement)
- ❌ Disabling certificate pinning for "easier development" without environment guard
- ❌ OTP field without `textContentType = .oneTimeCode` (auto-fill works insecurely)
- ❌ Not blurring the screen when app enters background (App Switcher leaks sensitive data)
- ❌ Hardcoding API keys or secrets in mobile app binary
- ❌ Storing encryption keys in the app bundle or assets folder

## References

- API security: [rules/api-security.md](api-security.md)
- OWASP Mobile Top 10: https://owasp.org/www-project-mobile-top-10/
- Android Keystore: https://developer.android.com/training/articles/keystore
- iOS Keychain: https://developer.apple.com/documentation/security/keychain_services
- Circular 77/2025/TT-NHNN — Session timeout 180s for banking mobile apps
