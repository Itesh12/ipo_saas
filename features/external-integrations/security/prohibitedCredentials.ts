/**
 * features/external-integrations/security/prohibitedCredentials.ts
 *
 * Security Guardrail: Prohibits and redacts high-risk financial credentials.
 * The SaaS platform NEVER touches, logs, or stores UPI PINs, MPINs, OTPs, netbanking passwords, or broker credentials.
 */

const PROHIBITED_KEY_PATTERNS = [
  /upi_?pin/i,
  /m_?pin/i,
  /atm_?pin/i,
  /trading_?pin/i,
  /t_?pin/i,
  /\botp\b/i,
  /one_?time_?password/i,
  /totp/i,
  /bank_?password/i,
  /netbanking_?password/i,
  /broker_?password/i,
  /client_?secret/i,
  /\bpassword\b/i,
];

export class ProhibitedCredentialError extends Error {
  constructor(public readonly key: string) {
    super(
      `Security Policy Violation: Prohibited credential key '${key}' detected. The platform strictly forbids storing or processing PINs, passwords, or OTPs.`
    );
    this.name = 'ProhibitedCredentialError';
  }
}

/**
 * Recursively scans an object for prohibited credential keys.
 * Throws ProhibitedCredentialError if any prohibited credential is found.
 */
export function assertNoProhibitedCredentials(obj: unknown, path: string = ''): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoProhibitedCredentials(item, `${path}[${idx}]`));
    return;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = path ? `${path}.${key}` : key;
    for (const pattern of PROHIBITED_KEY_PATTERNS) {
      if (pattern.test(key)) {
        throw new ProhibitedCredentialError(fullKey);
      }
    }
    if (value && typeof value === 'object') {
      assertNoProhibitedCredentials(value, fullKey);
    }
  }
}

/**
 * Redacts any prohibited credential keys found in an object, replacing them with a safe tombstone.
 */
export function sanitizeProhibitedCredentials<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeProhibitedCredentials(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    let isProhibited = false;
    for (const pattern of PROHIBITED_KEY_PATTERNS) {
      if (pattern.test(key)) {
        isProhibited = true;
        break;
      }
    }

    if (isProhibited) {
      result[key] = '[PROHIBITED_CREDENTIAL_REDACTED]';
    } else if (value && typeof value === 'object') {
      result[key] = sanitizeProhibitedCredentials(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
