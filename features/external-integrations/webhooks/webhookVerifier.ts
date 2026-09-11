/**
 * features/external-integrations/webhooks/webhookVerifier.ts
 *
 * Generic HMAC-SHA256 inbound webhook signature and replay verifier.
 */

import crypto from 'crypto';
import {
  IWebhookVerifier,
  WebhookVerificationRequest,
  WebhookVerificationResult,
} from './webhookTypes';

export class StandardHmacWebhookVerifier implements IWebhookVerifier {
  public async verify(request: WebhookVerificationRequest): Promise<WebhookVerificationResult> {
    const { rawPayload, headers, signingSecret, maxClockSkewSeconds = 300 } = request;

    if (!signingSecret) {
      return {
        valid: false,
        reason: 'missing_secret',
        errorMessage: 'Signing secret is missing or empty.',
      };
    }

    const signature = headers.signature || headers['x-hub-signature-256'] || headers['x-webhook-signature'];
    if (!signature) {
      return {
        valid: false,
        reason: 'missing_signature',
        errorMessage: 'Inbound webhook signature header is missing.',
      };
    }

    // Check clock skew if timestamp header is provided
    const rawTimestamp = headers.timestamp || headers['x-timestamp'];
    let timestampMs = Date.now();
    if (rawTimestamp) {
      const parsedTs = parseInt(rawTimestamp, 10);
      // Determine if timestamp is in seconds or milliseconds
      timestampMs = parsedTs > 100000000000 ? parsedTs : parsedTs * 1000;
      const skewSeconds = Math.abs(Date.now() - timestampMs) / 1000;

      if (skewSeconds > maxClockSkewSeconds) {
        return {
          valid: false,
          reason: 'clock_skew_exceeded',
          timestamp: timestampMs,
          errorMessage: `Webhook timestamp skewed by ${Math.round(skewSeconds)}s (max allowed: ${maxClockSkewSeconds}s).`,
        };
      }
    }

    // Compute expected HMAC-SHA256 signature
    const signaturePayload = rawTimestamp ? `${rawTimestamp}.${rawPayload}` : rawPayload;
    const expectedSig = crypto
      .createHmac('sha256', signingSecret)
      .update(signaturePayload)
      .digest('hex');

    // Clean incoming signature prefix if present (e.g., 'sha256=')
    const cleanReceivedSig = signature.replace(/^sha256=/i, '');

    // Constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    const receivedBuffer = Buffer.from(cleanReceivedSig, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return {
        valid: false,
        reason: 'invalid_signature',
        timestamp: timestampMs,
        errorMessage: 'Webhook signature verification failed.',
      };
    }

    return {
      valid: true,
      reason: 'valid',
      timestamp: timestampMs,
    };
  }
}

export const standardHmacWebhookVerifier = new StandardHmacWebhookVerifier();
