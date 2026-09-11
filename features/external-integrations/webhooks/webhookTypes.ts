/**
 * features/external-integrations/webhooks/webhookTypes.ts
 *
 * Inbound webhook signature verification contracts and schemas.
 */

export interface WebhookHeaders {
  signature?: string;
  timestamp?: string;
  providerEventId?: string;
  [key: string]: string | undefined;
}

export interface WebhookVerificationRequest {
  providerId: string;
  rawPayload: string; // Raw request body as UTF-8 string
  headers: WebhookHeaders;
  signingSecret: string;
  maxClockSkewSeconds?: number; // Default: 300 seconds (5 minutes)
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: 'valid' | 'invalid_signature' | 'clock_skew_exceeded' | 'missing_signature' | 'missing_secret';
  timestamp?: number;
  errorMessage?: string;
}

export interface IWebhookVerifier {
  verify(request: WebhookVerificationRequest): Promise<WebhookVerificationResult>;
}
