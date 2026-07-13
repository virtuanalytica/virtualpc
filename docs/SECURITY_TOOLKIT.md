# Security Toolkit — modules & how to wire them

Practical index of the security modules under `src/security/` and `src/auth/`,
with copy-paste wiring. Status legend: **WIRED** (live in the app) ·
**STANDALONE** (built + tested, apply where you choose) · **NEEDS-INFISICAL**
(armed, activates once Infisical is provisioned).

---

## Secrets — `src/security/secrets.ts`, `secretsBootstrap.ts` · NEEDS-INFISICAL

Single source of truth for secrets (Infisical, 3 layers `api`/`infra`/`money`),
Zod-validated, with a default-deny per-agent access model. No `.env`.

```ts
import { loadSecrets, setActiveSecrets, secretOrEnv } from './security/secretsBootstrap';

const secrets = await loadSecrets();   // null until INFISICAL_* provisioned (non-breaking)
setActiveSecrets(secrets);

// Trusted-core read (prefers Infisical, env fallback during migration):
const key = secretOrEnv('api', 'ANTHROPIC_API_KEY');

// Per-agent scoped read (default-deny — a scraper gets nothing):
secrets?.for('trader').get('money', 'ALPACA_API_KEY');
```

Go-live: provision Infisical (`INFISICAL_PROJECT_ID/CLIENT_ID/CLIENT_SECRET`)
through the process manager or a managed identity flow, then remove transitional
`process.env` secret fallbacks. See `OWNERSHIP.md`.

## Field encryption at rest — `src/security/fieldCrypto.ts` · WIRED

AES-256-GCM, tamper-detecting, versioned tokens. Used by `AuthSystem` for TOTP
secrets at rest.

```ts
const fc = new FieldCrypto(process.env.FIELD_ENCRYPTION_KEY!); // or FieldCrypto.fromEnv()
const token = fc.encrypt(secret);   // "v1:iv:tag:ct"
fc.decrypt(token);                  // throws on tamper / wrong key
```

## API keys — `apiKeys.ts` + `apiKeyMiddleware.ts` · STANDALONE (you choose routes)

Service-to-service `vpk_` keys (scrypt-hashed, scopes, TTL, revoke) + an opt-in
Express middleware. **Decide which routes accept keys** — e.g.:

```ts
import { ApiKeyManager } from './security/apiKeys';
import { apiKeyAuth } from './security/apiKeyMiddleware';

const apiKeys = new ApiKeyManager();
const { key } = apiKeys.issue('numerai-fetcher', { scopes: ['data:read'], ttlMs: 90*864e5 });

// Gate a route (X-API-Key or 'Authorization: ApiKey <key>'):
app.get('/api/data/feed', apiKeyAuth(apiKeys, { scope: 'data:read' }), handler);
```

## Recovery codes — `src/security/recoveryCodes.ts` · WIRED (into 2FA)

One-time backup codes accepted in place of a TOTP code at `verifyTwoFactor`.

```ts
const codes = authSystem.generateRecoveryCodes('user_ceo_001'); // show ONCE
// later: authSystem.verifyTwoFactor(challengeId, '<a recovery code>')  // single-use
```
*(Note: the AuthSystem wiring may need re-integration through the gate if a
branch shuffle dropped it — see `git log` for `recovery codes`.)*

## Login anomaly monitoring — `src/security/loginAnomalyMonitor.ts` · WIRED

Per-attempt risk scoring (new-device/new-IP/burst/velocity) fed into the audit
trail at `/api/auth/login` and `/api/auth/2fa/verify`.

## Audit-log retention — `src/auth/audit-retention.ts` · WIRED

`AuditRetentionScheduler` purges events older than `AUDIT_RETENTION_DAYS`
(default 90) on a daily, unref'd, error-isolated timer.

## Headers / rate limiting / CEO IP allowlist · WIRED

`securityHeaders.ts` (CSP/HSTS/CORS), `rateLimiter.ts`, and the `CEO_IP_ALLOWLIST`
gate in `AuthSystem.login`.

---

All modules above are unit-tested under `tests/unit/` (run `npx jest tests/unit`).
