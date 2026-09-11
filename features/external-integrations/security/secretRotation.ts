/**
 * features/external-integrations/security/secretRotation.ts
 *
 * Webhook Signing Key Ring supporting seamless key rotation.
 * Validates inbound payloads against active and previous signing keys in constant time.
 */

import crypto from 'crypto';

export interface KeyRingEntry {
  keyId: string;
  secret: string;
  status: 'active' | 'retiring';
  expiresAt?: string;
}

export class WebhookKeyRing {
  private keys: Map<string, KeyRingEntry> = new Map();

  constructor(initialKeys: KeyRingEntry[] = []) {
    for (const k of initialKeys) {
      this.keys.set(k.keyId, k);
    }
  }

  public addKey(entry: KeyRingEntry): void {
    this.keys.set(entry.keyId, entry);
  }

  public listKeys(): KeyRingEntry[] {
    return Array.from(this.keys.values());
  }

  /**
   * Attempts constant-time verification against all active and retiring keys in the ring.
   */
  public verifySignatureAgainstRing(
    payload: string,
    signature: string
  ): { valid: boolean; matchedKeyId?: string } {
    const rawSig = signature.trim().replace(/^sha256=/, '');

    for (const key of this.keys.values()) {
      const computed = crypto.createHmac('sha256', key.secret).update(payload).digest('hex');

      try {
        const sigBuf = Buffer.from(rawSig, 'hex');
        const compBuf = Buffer.from(computed, 'hex');

        if (sigBuf.length === compBuf.length && crypto.timingSafeEqual(sigBuf, compBuf)) {
          return { valid: true, matchedKeyId: key.keyId };
        }
      } catch {
        // Continue checking other keys
      }
    }

    return { valid: false };
  }
}
