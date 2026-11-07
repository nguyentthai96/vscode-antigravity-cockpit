---
trigger: model_decision
description: "Logging rules covering structured JSON logging, SLF4J standards, MDC context propagation, log levels, sensitive data masking, and security event logging for base-core."
---

# Logging Rules

> Logging standards for Java/Kotlin Spring Boot applications in base-core.

## Principles

- Structured logging (JSON) by default — human-readable on demand
- Every request must be traceable end-to-end
- Log at the right level — not too much, not too little
- Never log sensitive data

## Rules

### Framework

- Use **SLF4J** as logging facade — never import `java.util.logging` or Log4j directly
- Use `@Slf4j` (Lombok) or `LoggerFactory.getLogger()` for logger creation
- Use **Logback** as default implementation (Spring Boot default)

### Structured Logging (JSON)

- Use Spring Boot's built-in structured logging:

```yaml
# application.yml
logging:
  structured:
    format:
      console: logstash   # JSON output for production
```

- Include standard fields: `timestamp`, `level`, `logger`, `message`, `traceId`, `spanId`
- Add business context with MDC (Mapped Diagnostic Context)

### Log Levels

| Level | Use When | Example |
|-------|----------|---------|
| `ERROR` | System failure, requires immediate attention | DB connection lost, external API 500 |
| `WARN` | Unexpected but recoverable | Cache miss, retry triggered, 4xx client error |
| `INFO` | Business events, state changes | User created, order placed, payment processed |
| `DEBUG` | Technical details for troubleshooting | SQL queries, request/response payloads |
| `TRACE` | Very detailed flow tracing | Method entry/exit, variable values |

- Production: `INFO` level by default
- Debug: Enable `DEBUG` per-package, never globally

### MDC Context Propagation

- Set `userId`, `requestId`, `correlationId` in MDC at request entry
- Clear MDC at request completion (use `Filter` or `Interceptor`)
- Propagate MDC across async boundaries (`@Async`, `CompletableFuture`)
- Include MDC fields in structured log output

### What to Log

- ✅ Request received (method, path, user)
- ✅ Business events (entity created/updated/deleted)
- ✅ External service calls (URL, duration, status)
- ✅ Errors and exceptions (full stack trace at ERROR level)
- ✅ Performance metrics (slow queries > threshold)

### Security Logging

- **Log all security events** — authentication, authorization failures, administrative actions, payment transactions
- **Error responses**: return a generic error message to the client; never expose stack traces, database names, or file paths
- **Log file location**: store outside the webroot; restrict access (read-only for the application, no public access)
- **NEVER log**: passwords, tokens, session IDs, card numbers (PAN), CVV, OTP, or any full personal data

#### Security Events That Must Be Logged

| Event | Level | Required Fields |
|-------|-------|-----------------|
| Login success / failure | `INFO` / `WARN` | userId, IP, user-agent, timestamp |
| Authorization failure (403) | `WARN` | userId, resource, action, IP |
| Token issued / revoked | `INFO` | jti, userId, expiry, IP |
| Password change / reset | `INFO` | userId, IP, timestamp |
| Admin action | `INFO` | adminId, targetId, action, timestamp |
| Payment / financial transaction | `INFO` | transactionId, amount (no card data), status |
| Suspicious activity detected | `WARN` | userId, reason, IP, timestamp |
| Account lockout triggered | `WARN` | userId, failCount, IP, timestamp |

### Data Masking Rules (required before pushing to Kafka / ELK / any log sink)

| Field | Masking Pattern | Example |
|-------|----------------|---------|
| `password` / `otp` / `pin` / `cvv` | Full mask | `***MASKED***` |
| Card number (PAN) | First 4 + last 4, mask middle | `XXXX-XXXX-XXXX-{last 4}` |
| `accessToken` / `refreshToken` | First 8 chars only | `{first 8 chars}...` |
| Email (Tier 2+) | Mask local-part + domain | `x***@***.com` |
| Phone number (SĐT) | Mask middle digits | `***-***-{last 4}` |
| National ID / Passport | Mask all but last 3 | `*******{last 3}` |

#### Masking Implementation Pattern

```java
// Use a dedicated masking utility — never inline string replacement
public class SensitiveDataMasker {
    public static String maskToken(String token) {
        if (token == null || token.length() < 8) return "***MASKED***";
        return token.substring(0, 8) + "...";
    }

    public static String maskPan(String pan) {
        if (pan == null || pan.length() < 8) return "***MASKED***";
        return pan.substring(0, 4) + "-XXXX-XXXX-" + pan.substring(pan.length() - 4);
    }

    public static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "***MASKED***";
        return "x***@***" + email.substring(email.lastIndexOf('.'));
    }
}
```

### What NOT to Log

- ❌ Passwords, tokens, session IDs, API keys, secrets
- ❌ Full PII (email, phone, national ID) — apply masking table above
- ❌ Card numbers / CVV / OTP (PCI-DSS violation)
- ❌ Full request/response bodies in production (use `DEBUG` level with masking)
- ❌ Stack traces, database names, or file paths in client-facing error messages
- ❌ Health check requests (noise)

### Performance

- Use parameterized logging: `log.info("User {} created", userId)` — NOT string concatenation
- Guard expensive log computations: `if (log.isDebugEnabled())`
- Avoid logging in tight loops
- Set appropriate log rotation and retention

## Anti-Patterns

- ❌ Using `System.out.println()` for logging
- ❌ String concatenation in log messages: `log.info("User " + id + " created")`
- ❌ Logging sensitive data (passwords, tokens, PII, PAN, CVV, OTP)
- ❌ Setting `DEBUG` or `TRACE` globally in production
- ❌ Missing correlation IDs in distributed systems
- ❌ Swallowing exceptions: `catch (Exception e) { log.error("error") }` — always log the exception object!
- ❌ Logging at wrong level (INFO for debug details, ERROR for business validation)
- ❌ Exposing stack traces, DB names, or file paths in error responses
- ❌ Logging inside tight loops without sampling
- ❌ Missing masking before pushing logs to Kafka / ELK / external sinks
- ❌ Storing log files inside the webroot (path traversal / public access risk)

## References

- Logging patterns skill: [skills/logging-patterns/](../skills/logging-patterns/)
- Error handling: [rules/error-handling.md](error-handling.md)
- Spring Boot rules: [rules/spring-boot.md](spring-boot.md)
- API security: [rules/api-security.md](api-security.md)
- PCI-DSS Logging Requirements: https://www.pcisecuritystandards.org/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
