---
trigger: model_decision
description: "API security rules covering Authentication, Authorization (IDOR/BOLA), Session Management, Brute-force Protection, OAuth2/JWT token management, Input Validation, Injection Prevention, refresh/revoke strategies, and E2EE best practices for production systems."
---

# API Security Rules

> Security rules for API Gateway, OAuth2/JWT token management, Session Management, Brute-force Protection, and encrypted communication in base-core.

## Principles

- Defense in depth — multiple security layers
- Least privilege — minimal required permissions
- Zero trust — verify every request
- Fail secure — deny by default on errors
- Short-lived credentials — minimize token lifetime

## Rules

### Authentication

- **Do not use Basic Auth**; use JWT (RS256) or OAuth 2.0
- JWT: validate `issuer`, `audience`, `expiry` in full — never skip
  - Reject `alg:none`; do not sign HS256 with a shared secret
- OAuth: validate `redirect_uri` with exact match; use `response_type=code` + `state` to prevent CSRF
- JWT must include mandatory claims: `iss`, `aud`, `exp`, `nbf`, `jti`, `scope`
- Access token TTL: **5–15 minutes** (short-lived, stateless validation)
- Refresh token TTL: **longer** with rotation strategy; bind to device/client/IP when possible

### Session Management

- Session ID: minimum **128-bit**, cryptographically random; **regenerate after login** (prevent session fixation)
- Cookie flags: `Secure`, `HttpOnly`, `SameSite=Strict` — mandatory
- **Banking / finance**: session must expire after **180 seconds** of inactivity *(Circular 77/2025/TT-NHNN)*
- **Logout**: invalidate both the Session ID and all server-side session data (Redis/DB)
- When user permissions change → invalidate all active sessions immediately

### Token Refresh & Rotation

- Implement **refresh token rotation** (new refresh token on each use)
- Detect and reject **reuse of rotated tokens** (compromised token detection)
- Choose between sliding session vs absolute expiry based on use case
- Clearly separate access token renewal from session prolongation

### Token Revocation

- Implement `jti`-based token blacklist for immediate revocation (Redis)
- Support versioned tokens (`token_version`) for bulk invalidation
- Implement back-channel logout for SSO scenarios
- Revoke tokens on: logout, password change, role change, compromised device detection
- Trade-off: immediate revoke (Redis lookup) vs eventual consistency (short TTL)

### Brute-force & Abuse Protection

- **CAPTCHA** after **5 consecutive failed attempts**; counter stored server-side (never client-side)
- Progressive delay: temporary lockout after N failures (exponential back-off)
- Rate limiting by IP + username at the API Gateway
- Alert on detected credential stuffing or password spraying

### Server-to-Server Authentication

- Minimum **3 factors**: username, password **and** at least one additional factor such as:
  - `mTLS` (mutual TLS certificate)
  - Source IP `allowlist`
  - API key + HMAC signature
- Use **Client Credentials** grant (OAuth 2.0) for service-to-service communication
- Rotate machine credentials regularly (maximum every 90 days)

### Encryption & Communication

- Enforce **mTLS** between Gateway ↔ Microservices
- Implement certificate rotation with automated renewal
- Use **AES-256-GCM** for application-layer payload encryption
- Use **RSA-2048+ / ECDH** for key exchange
- Manage keys via KMS / HSM with envelope encryption
- Distinguish between transport encryption (TLS) and true E2EE
- TLS **1.2 minimum**, TLS 1.3 preferred; disable older protocols

### Input Validation & Injection Prevention (Server-side)

- Validate **type, length, and format** for **every field** — never trust client-side validation
- Use **parameterized queries** / JPA criteria — **never concatenate strings in SQL**
- Validate `Content-Type` → return `415 Unsupported Media Type` if wrong; validate HTTP method → return `405 Method Not Allowed` if wrong
- **Never pass sensitive data via query string** (token, password, PII) — use `Authorization` header or request body
- Encode output context-appropriately (HTML, JSON, URL) to prevent XSS
- Limit request body size to prevent DoS via large payloads
- Strip/reject dangerous characters in file upload names

### API Gateway (Spring Cloud Gateway)

- Validate JWT at the gateway level (stateless)
- Enforce scope and policy rules at gateway filters
- Apply rate limiting and abuse prevention at the edge
- Log and trace all token usage for audit
- Block requests missing required security headers

### Resource Server Security

- Use method-level security (`@PreAuthorize`) — do not rely solely on the gateway
- Implement claim-based authorization
- Configure CORS: whitelist origins explicitly, no wildcard `*` in production
- Protect state-changing endpoints with CSRF tokens or `SameSite=Strict`

### Authorization & Access Control (IDOR / BOLA Prevention)

- **Enforce authorization server-side BEFORE executing logic or queries** — never trust client-supplied parameters
- **Use UUID** for resource identifiers; **never use sequential integers** (easy to enumerate → IDOR/BOLA)
- Prefer endpoint **`/me/orders`** over `/user/654321/orders` — avoid exposing resource IDs directly in URLs
- **Every controller method** must have **one explicit authorization check** (`@PreAuthorize`, service-layer check)
- **Admin pages**: restrict by IP allowlist **or** enforce SSO — never expose publicly
- Validate that the resource belongs to the authenticated user before every read/write/delete
- Apply **RBAC/ABAC** consistently; never hardcode permission logic inside business logic

### Security Headers (required on every response)

| Header | Recommended Value |
|--------|-------------------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | Restrict sources; no `unsafe-inline` |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Restrict camera/mic/geolocation |
| `Server` | **Remove** (do not disclose tech stack) |
| `X-Powered-By` | **Remove** (do not disclose framework) |

### Threat Mitigation (OWASP / STRIDE)

| Threat | Mitigation |
|--------|------------|
| Token theft | Short TTL + refresh rotation + device binding |
| Replay attack | `jti` claim + nonce + timestamp validation |
| Session fixation | Regenerate session ID after login |
| CSRF | CSRF tokens + `SameSite=Strict` cookies |
| XSS | CSP headers + output encoding + input sanitization |
| SQL Injection | Parameterized queries only |
| IDOR / BOLA | Server-side authz check + UUID resource ID |
| Brute-force | CAPTCHA + rate limiting + account lockout |
| Information disclosure | Remove `Server` & `X-Powered-By` headers |
| Sensitive data exposure | No secrets/PII in query string; use headers/body |
| Man-in-the-middle | mTLS + certificate pinning |
| Privilege escalation | Scope-based validation + least privilege |

### Observability & Audit

- Audit log all authentication/authorization events (success & failure)
- Log: source IP, user-agent, user ID, action, timestamp — never log passwords or tokens
- Trace token usage across services (correlation ID)
- Implement anomaly detection on login patterns
- Alert on: unusual token refresh/revoke activity, brute-force spikes, mass account lockout

## Anti-Patterns

- ❌ Using Basic Auth or unencrypted API key in headers
- ❌ Long-lived access tokens (> 30 minutes)
- ❌ Storing JWT in `localStorage` (XSS vulnerable) — use `httpOnly` cookie instead
- ❌ Refresh tokens without rotation
- ❌ Skipping `jti` validation on token reuse
- ❌ Hardcoded secrets or keys in source code
- ❌ Disabling CSRF protection without justification
- ❌ `alg:none` or signing HS256 with a public shared secret
- ❌ Session ID unchanged after login (session fixation)
- ❌ CORS wildcard `*` in production environments
- ❌ String-concatenated SQL / HQL queries
- ❌ Trust-on-first-use without verification
- ❌ Not invalidating server-side session data on logout
- ❌ Using sequential integer IDs for resource URLs (IDOR-prone)
- ❌ Missing authorization check at the service layer (relying solely on the gateway)
- ❌ Passing token/password/PII via query string (logged in access logs)
- ❌ Exposing `Server` or `X-Powered-By` headers (information disclosure)

## References

- Security architecture: [agents/security-engineer.md](../agents/security-engineer.md)
- Architecture review: [skills/architect-review/](../skills/architect-review/)
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Circular 77/2025/TT-NHNN — Session timeout requirement for banking systems