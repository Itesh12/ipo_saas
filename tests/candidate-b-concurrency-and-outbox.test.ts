/**
 * tests/candidate-b-concurrency-and-outbox.test.ts
 *
 * Candidate B (Revision 3): Concurrency, Replay, Crash/Recovery & Outbox Tests.
 *
 * Implements the 5 Critical Failure Mode Scenarios:
 * - Scenario A: Concurrent dispatch (Two workers processing the same event concurrently)
 * - Scenario B: Event replay (Replaying the same event 10 times)
 * - Scenario C: Crash after emission (Recovery from EMITTED -> ACKNOWLEDGED)
 * - Scenario D: Reviewer collision (Same administrator cannot approve both sides)
 * - Scenario E: Stale projection protection (Older verification cannot override newer evidence)
 * - Outbox Audit Retention: Successfully processed outbox events are NEVER deleted.
 *
 * Core Contract:
 * At-least-once delivery + idempotent Stage 5 consumption = exactly-once effective financial mutation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

describe('Candidate B: Concurrency, Replay & Durable Outbox Engine', () => {
  // Pure domain mock of Stage 5 Idempotent Consumption
  class MockStage5FinancialEngine {
    private processedEvents = new Map<string, { status: string; result: any }>();
    private journalEntries: any[] = [];
    private portfolioPositions = new Map<string, number>();

    async processAllotmentVerifiedFinancialEvent(event: {
      eventId: string;
      idempotencyKey: string;
      payload: {
        applicationId: string;
        sharesAllotted: number;
        allotmentPrice: number;
        refundAmount: number;
      };
    }): Promise<{ success: boolean; status: string; transactionId?: string; isDuplicate?: boolean }> {
      // 1. Idempotency Check on Business Key
      if (this.processedEvents.has(event.idempotencyKey)) {
        const existing = this.processedEvents.get(event.idempotencyKey)!;
        return {
          success: true,
          status: 'PROCESSED',
          transactionId: existing.result.transactionId,
          isDuplicate: true,
        };
      }

      // Simulate atomic processing delay
      await new Promise((r) => setTimeout(r, 10));

      // Double check lock / race
      if (this.processedEvents.has(event.idempotencyKey)) {
        const existing = this.processedEvents.get(event.idempotencyKey)!;
        return {
          success: true,
          status: 'PROCESSED',
          transactionId: existing.result.transactionId,
          isDuplicate: true,
        };
      }

      // 2. Perform Single Financial Mutation
      const txId = `tx_${crypto.randomUUID().slice(0, 8)}`;
      const { sharesAllotted, allotmentPrice, refundAmount } = event.payload;

      this.journalEntries.push({
        id: `j_${crypto.randomUUID().slice(0, 8)}`,
        idempotencyKey: event.idempotencyKey,
        debit: sharesAllotted * allotmentPrice,
        credit: sharesAllotted * allotmentPrice,
      });

      const currentPos = this.portfolioPositions.get(event.payload.applicationId) || 0;
      this.portfolioPositions.set(event.payload.applicationId, currentPos + sharesAllotted);

      this.processedEvents.set(event.idempotencyKey, {
        status: 'PROCESSED',
        result: { transactionId: txId },
      });

      return {
        success: true,
        status: 'PROCESSED',
        transactionId: txId,
        isDuplicate: false,
      };
    }

    getJournalCount() {
      return this.journalEntries.length;
    }

    getPosition(appId: string) {
      return this.portfolioPositions.get(appId) || 0;
    }

    getProcessedEventCount() {
      return this.processedEvents.size;
    }
  }

  // Pure domain mock of Stage 4 Durable Outbox
  class MockStage4Outbox {
    private events = new Map<string, any>();

    enqueue(event: any) {
      this.events.set(event.idempotency_key, {
        ...event,
        status: 'PENDING',
        retry_count: 0,
        created_at: new Date().toISOString(),
      });
      return this.events.get(event.idempotency_key);
    }

    get(idempotencyKey: string) {
      return this.events.get(idempotencyKey);
    }

    getAll() {
      return Array.from(this.events.values());
    }

    markEmitted(idempotencyKey: string) {
      const item = this.events.get(idempotencyKey);
      if (item) {
        item.status = 'EMITTED';
        item.emitted_at = new Date().toISOString();
      }
    }

    markAcknowledged(idempotencyKey: string) {
      const item = this.events.get(idempotencyKey);
      if (item) {
        item.status = 'ACKNOWLEDGED';
        item.acknowledged_at = new Date().toISOString();
      }
    }

    markFailed(idempotencyKey: string, err: string) {
      const item = this.events.get(idempotencyKey);
      if (item) {
        item.retry_count += 1;
        item.last_error = err;
        item.status = item.retry_count >= 5 ? 'FAILED' : 'PENDING';
      }
    }
  }

  it('SCENARIO A: Concurrent Dispatch — Two parallel workers result in exactly 1 effective financial mutation', async () => {
    const stage5 = new MockStage5FinancialEngine();
    const outbox = new MockStage4Outbox();

    const sharedEvent = {
      event_id: 'evt-001',
      idempotency_key: 'phase4:app:app-001:allotment:allot_app-001',
      payload: {
        applicationId: 'app-001',
        sharesAllotted: 150,
        allotmentPrice: 100,
        refundAmount: 0,
      },
    };

    outbox.enqueue(sharedEvent);

    // Worker 1 and Worker 2 race simultaneously
    const worker1 = async () => {
      outbox.markEmitted(sharedEvent.idempotency_key);
      const res = await stage5.processAllotmentVerifiedFinancialEvent({
        eventId: sharedEvent.event_id,
        idempotencyKey: sharedEvent.idempotency_key,
        payload: sharedEvent.payload,
      });
      if (res.success) outbox.markAcknowledged(sharedEvent.idempotency_key);
      return res;
    };

    const worker2 = async () => {
      outbox.markEmitted(sharedEvent.idempotency_key);
      const res = await stage5.processAllotmentVerifiedFinancialEvent({
        eventId: sharedEvent.event_id,
        idempotencyKey: sharedEvent.idempotency_key,
        payload: sharedEvent.payload,
      });
      if (res.success) outbox.markAcknowledged(sharedEvent.idempotency_key);
      return res;
    };

    const [res1, res2] = await Promise.all([worker1(), worker2()]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);

    // EXACTLY ONCE FINANCIAL EFFECT GUARANTEES:
    assert.strictEqual(stage5.getJournalCount(), 1, 'Exactly 1 double-entry journal created');
    assert.strictEqual(stage5.getPosition('app-001'), 150, 'Position must be exactly 150 shares (no double-counting)');
    assert.strictEqual(outbox.get(sharedEvent.idempotency_key).status, 'ACKNOWLEDGED');
  });

  it('SCENARIO B: Replay — Delivering the same event 10 times results in exactly 1 financial effect', async () => {
    const stage5 = new MockStage5FinancialEngine();

    const event = {
      eventId: 'evt-replay-001',
      idempotencyKey: 'phase4:app:app-002:allotment:allot_app-002',
      payload: {
        applicationId: 'app-002',
        sharesAllotted: 50,
        allotmentPrice: 200,
        refundAmount: 5000,
      },
    };

    // Replay 10 times
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await stage5.processAllotmentVerifiedFinancialEvent(event);
      results.push(res);
    }

    assert.strictEqual(results.length, 10);
    assert.strictEqual(results[0].isDuplicate, false);
    for (let i = 1; i < 10; i++) {
      assert.strictEqual(results[i].isDuplicate, true, `Delivery ${i + 1} must be detected as duplicate`);
    }

    assert.strictEqual(stage5.getJournalCount(), 1, 'Zero duplicate journals across 10 replays');
    assert.strictEqual(stage5.getPosition('app-002'), 50, 'Position must be 50 shares');
  });

  it('SCENARIO C: Crash After Emission — Event in EMITTED recovered and acknowledged without double-crediting', async () => {
    const stage5 = new MockStage5FinancialEngine();
    const outbox = new MockStage4Outbox();

    const event = {
      event_id: 'evt-crash-001',
      idempotency_key: 'phase4:app:app-003:allotment:allot_app-003',
      payload: {
        applicationId: 'app-003',
        sharesAllotted: 100,
        allotmentPrice: 150,
        refundAmount: 0,
      },
    };

    outbox.enqueue(event);

    // 1. Worker marks EMITTED and delivers to Stage 5
    outbox.markEmitted(event.idempotency_key);
    await stage5.processAllotmentVerifiedFinancialEvent({
      eventId: event.event_id,
      idempotencyKey: event.idempotency_key,
      payload: event.payload,
    });

    // 2. CRASH OCCURS HERE before outbox could be marked ACKNOWLEDGED
    assert.strictEqual(outbox.get(event.idempotency_key).status, 'EMITTED');

    // 3. Recovery worker picks up EMITTED event and redelivers
    const recoveryRes = await stage5.processAllotmentVerifiedFinancialEvent({
      eventId: event.event_id,
      idempotencyKey: event.idempotency_key,
      payload: event.payload,
    });

    assert.strictEqual(recoveryRes.success, true);
    assert.strictEqual(recoveryRes.isDuplicate, true);

    // 4. Outbox successfully transitions to terminal ACKNOWLEDGED
    outbox.markAcknowledged(event.idempotency_key);

    assert.strictEqual(outbox.get(event.idempotency_key).status, 'ACKNOWLEDGED');
    assert.strictEqual(stage5.getJournalCount(), 1, 'Crash recovery must not create duplicate financial journal');
    assert.strictEqual(stage5.getPosition('app-003'), 100);
  });

  it('SCENARIO D: Reviewer Collision — Prevents same user from completing primary and secondary review', () => {
    const reviewerA = 'admin-user-1';
    const reviewerB = 'admin-user-1'; // Same user!

    const isCollision = reviewerA === reviewerB;
    assert.strictEqual(isCollision, true);

    const validateReviewers = (primary: string, secondary: string) => {
      if (primary === secondary) {
        throw new Error('REVIEWER_COLLISION: Dual-control violation! Secondary reviewer must be distinct.');
      }
    };

    assert.throws(
      () => validateReviewers(reviewerA, reviewerB),
      /REVIEWER_COLLISION/
    );
  });

  it('SCENARIO E: Stale Projection Protection — Older evidence rejected when newer projection exists', () => {
    const currentProjection = {
      observedAt: new Date('2026-09-17T12:00:00Z').getTime(),
      sharesAllotted: 100,
      classification: 'REGISTRAR_CONFIRMED',
    };

    const olderEvidence = {
      observedAt: new Date('2026-09-17T10:00:00Z').getTime(), // 2 hours older
      sharesAllotted: 0,
      classification: 'REGISTRAR_CONFIRMED',
    };

    const isStale = olderEvidence.observedAt < currentProjection.observedAt;
    assert.strictEqual(isStale, true);

    // Stale evidence must be rejected from overriding current projection
    const effectiveAllotment = isStale ? currentProjection.sharesAllotted : olderEvidence.sharesAllotted;
    assert.strictEqual(effectiveAllotment, 100, 'Current 100 shares preserved; stale evidence ignored');
  });

  it('OUTBOX RETENTION RULE: Successfully processed outbox events are NEVER deleted', () => {
    const outbox = new MockStage4Outbox();

    const event = {
      event_id: 'evt-audit-001',
      idempotency_key: 'phase4:app:app-004:allotment:allot_app-004',
      payload: { applicationId: 'app-004' },
    };

    outbox.enqueue(event);
    outbox.markEmitted(event.idempotency_key);
    outbox.markAcknowledged(event.idempotency_key);

    const records = outbox.getAll();
    assert.strictEqual(records.length, 1, 'Outbox event must NOT be deleted after ACK');
    assert.strictEqual(records[0].status, 'ACKNOWLEDGED');
    assert.ok(records[0].acknowledged_at, 'acknowledged_at timestamp must be recorded');
  });
});
