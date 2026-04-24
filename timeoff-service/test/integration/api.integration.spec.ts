/**
 * Integration Test Suite
 * ─────────────────────
 * Spins up the full NestJS app against a real SQLite (in-memory) DB
 * and the mock HCM server. Tests verify the complete request flow
 * end-to-end through HTTP.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import axios from 'axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

// The mock HCM server must be running separately (npm run mock-hcm)
// OR we start it programmatically here:
const { app: hcmApp } = require('../../mock-hcm/server');

const HCM_BASE_URL = 'http://localhost:4001'; // separate port for integration tests
const HCM_API_KEY  = 'mock-hcm-api-key-secret';

describe('Time-Off API Integration Tests', () => {
  let app: INestApplication;
  let hcmServer: any;

  // ── Setup ─────────────────────────────────────────────────────────────────
  beforeAll(async () => {
    // Start mock HCM on port 4001
    await new Promise<void>((resolve) => {
      hcmServer = hcmApp.listen(4001, resolve);
    });

    // Override env for tests
    process.env.HCM_BASE_URL              = HCM_BASE_URL;
    process.env.HCM_API_KEY               = HCM_API_KEY;
    process.env.DB_PATH                   = ':memory:';
    process.env.BALANCE_STALE_THRESHOLD_MINUTES = '999'; // never stale in tests
    process.env.HCM_RETRY_ATTEMPTS        = '1';
    process.env.HCM_RETRY_DELAY_MS        = '10';
    process.env.HCM_TIMEOUT_MS            = '5000';
    process.env.HCM_WEBHOOK_SECRET        = 'mock-webhook-hmac-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => hcmServer.close(resolve));
  });

  // Reset HCM state and local database before each test for isolation
  beforeEach(async () => {
    await axios.post(`${HCM_BASE_URL}/test/reset`);
    await request(app.getHttpServer()).post('/test/reset-db');
  });

  // ── Helper ────────────────────────────────────────────────────────────────
  async function seedBalance(employeeId: string, locationId: string, balanceDays: number) {
    await axios.post(`${HCM_BASE_URL}/test/set-balance`, { employeeId, locationId, balanceDays });
    // Seed the local cache via batch sync
    await request(app.getHttpServer())
      .post('/balances/sync/batch')
      .send({ records: [{ employeeId, locationId, balanceDays }] })
      .expect(200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BALANCE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /balances/:employeeId/:locationId', () => {
    it('returns 404 when no balance exists for employee', async () => {
      // HCM also has no record — will return 404
      const res = await request(app.getHttpServer())
        .get('/balances/EMP-UNKNOWN/LOC-UK')
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('returns balance when it exists in local cache', async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);

      const res = await request(app.getHttpServer())
        .get('/balances/EMP-001/LOC-UK')
        .expect(200);

      expect(res.body.balanceDays).toBe(10);
      expect(res.body.employeeId).toBe('EMP-001');
      expect(res.body.locationId).toBe('LOC-UK');
    });

    it('returns X-Balance-Stale header when HCM unreachable and cache is stale', async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);

      // Force balance to be stale by manipulating threshold temporarily
      const origThreshold = process.env.BALANCE_STALE_THRESHOLD_MINUTES;
      process.env.BALANCE_STALE_THRESHOLD_MINUTES = '0'; // everything is stale

      // Make HCM fail
      await axios.post(`${HCM_BASE_URL}/test/simulate-error`, { code: 'SERVER_ERROR', times: 5 });

      const res = await request(app.getHttpServer())
        .get('/balances/EMP-001/LOC-UK');

      process.env.BALANCE_STALE_THRESHOLD_MINUTES = origThreshold;

      expect(res.headers['x-balance-stale']).toBe('true');
      expect(res.body.balanceDays).toBe(10); // still returns cached
    });
  });

  describe('POST /balances/sync/batch', () => {
    it('upserts all balance records from batch payload', async () => {
      const records = [
        { employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 15 },
        { employeeId: 'EMP-002', locationId: 'LOC-DE', balanceDays: 20 },
      ];

      const res = await request(app.getHttpServer())
        .post('/balances/sync/batch')
        .send({ records })
        .expect(200);

      expect(res.body.processed).toBe(2);
      expect(res.body.errors).toBe(0);
    });

    it('is idempotent — replaying same batch gives same balances', async () => {
      const records = [{ employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 12 }];

      await request(app.getHttpServer())
        .post('/balances/sync/batch')
        .send({ records })
        .expect(200);

      await request(app.getHttpServer())
        .post('/balances/sync/batch')
        .send({ records })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/balances/EMP-001/LOC-UK')
        .expect(200);

      expect(res.body.balanceDays).toBe(12);
    });
  });

  describe('POST /balances/sync/realtime', () => {
    it('fetches and updates balance from HCM', async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);

      // HCM has a newer value (e.g. anniversary bonus applied)
      await axios.post(`${HCM_BASE_URL}/test/anniversary`, {
        employeeId: 'EMP-001', locationId: 'LOC-UK', bonusDays: 5,
      });

      const res = await request(app.getHttpServer())
        .post('/balances/sync/realtime')
        .send({ employeeId: 'EMP-001', locationId: 'LOC-UK' })
        .expect(200);

      expect(res.body.balanceDays).toBe(15); // 10 + 5 bonus
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REQUEST LIFECYCLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /requests', () => {
    beforeEach(async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);
    });

    it('creates a request and transitions to AWAITING_APPROVAL', async () => {
      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001',
          locationId: 'LOC-UK',
          daysRequested: 3,
          startDate: '2026-07-01',
          endDate: '2026-07-03',
        })
        .expect(201);

      expect(res.body.status).toBe('AWAITING_APPROVAL');
      expect(res.body.hcmReferenceId).toBeDefined();
    });

    it('returns 422 when balance is insufficient (caught locally before HCM)', async () => {
      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001',
          locationId: 'LOC-UK',
          daysRequested: 15, // more than 10 available
          startDate: '2026-07-01',
          endDate: '2026-07-15',
        })
        .expect(422);

      expect(res.body.message).toContain('Insufficient balance');
    });

    it('returns 400 when endDate is before startDate', async () => {
      await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001',
          locationId: 'LOC-UK',
          daysRequested: 3,
          startDate: '2026-07-10',
          endDate: '2026-07-01', // invalid
        })
        .expect(400);
    });

    it('returns 400 when required fields are missing', async () => {
      await request(app.getHttpServer())
        .post('/requests')
        .send({ employeeId: 'EMP-001' }) // missing locationId, dates, days
        .expect(400);
    });

    it('returns 409 when dates overlap with an existing active request', async () => {
      // First request — success
      await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001', locationId: 'LOC-UK',
          daysRequested: 2, startDate: '2026-07-01', endDate: '2026-07-02',
        })
        .expect(201);

      // Second request — overlaps
      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001', locationId: 'LOC-UK',
          daysRequested: 2, startDate: '2026-07-02', endDate: '2026-07-04',
        })
        .expect(409);

      expect(res.body.message).toContain('overlap');
    });

    it('stays PENDING when HCM is unreachable at submission time', async () => {
      await axios.post(`${HCM_BASE_URL}/test/simulate-error`, { code: 'SERVER_ERROR', times: 5 });

      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001', locationId: 'LOC-UK',
          daysRequested: 2, startDate: '2026-08-01', endDate: '2026-08-02',
        })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
    });

    it('marks as FAILED when HCM explicitly rejects with insufficient balance', async () => {
      // Override HCM to reject the request even though local balance says ok
      await axios.post(`${HCM_BASE_URL}/test/simulate-error`, {
        code: 'HCM_REJECT', errorCode: 'INSUFFICIENT_BALANCE',
        message: 'HCM balance already committed elsewhere', times: 1,
      });

      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001', locationId: 'LOC-UK',
          daysRequested: 3, startDate: '2026-09-01', endDate: '2026-09-03',
        })
        .expect(422);

      expect(res.body.error).toContain('INSUFFICIENT_BALANCE');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('Full Request Lifecycle', () => {
    let requestId: number;

    beforeEach(async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);

      const res = await request(app.getHttpServer())
        .post('/requests')
        .send({
          employeeId: 'EMP-001', locationId: 'LOC-UK',
          daysRequested: 3, startDate: '2026-07-01', endDate: '2026-07-03',
        })
        .expect(201);

      requestId = res.body.id;
    });

    it('full happy path: PENDING → AWAITING_APPROVAL → APPROVED', async () => {
      // Confirm status after creation
      let res = await request(app.getHttpServer()).get(`/requests/${requestId}`);
      expect(res.body.status).toBe('AWAITING_APPROVAL');

      // Manager approves
      res = await request(app.getHttpServer())
        .patch(`/requests/${requestId}/approve`)
        .expect(200);

      expect(res.body.status).toBe('APPROVED');
    });

    it('manager rejection: AWAITING_APPROVAL → REJECTED (HCM reversal called)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/requests/${requestId}/reject`)
        .send({ reason: 'Understaffed that week' })
        .expect(200);

      expect(res.body.status).toBe('REJECTED');

      // Verify HCM received a REVERSE call
      const hcmState = await axios.get(`${HCM_BASE_URL}/test/state`);
      const reversals = hcmState.data.requestLog.filter((r: any) => r.requestType === 'REVERSE');
      expect(reversals.length).toBeGreaterThan(0);
    });

    it('employee cancels AWAITING_APPROVAL: → CANCELLED (HCM reversal called)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/requests/${requestId}/cancel`)
        .expect(200);

      expect(res.body.status).toBe('CANCELLED');

      const hcmState = await axios.get(`${HCM_BASE_URL}/test/state`);
      const reversals = hcmState.data.requestLog.filter((r: any) => r.requestType === 'REVERSE');
      expect(reversals.length).toBeGreaterThan(0);
    });

    it('cannot approve an already-approved request', async () => {
      await request(app.getHttpServer()).patch(`/requests/${requestId}/approve`);

      const res = await request(app.getHttpServer())
        .patch(`/requests/${requestId}/approve`)
        .expect(400);

      expect(res.body.message).toContain('APPROVED');
    });

    it('cannot cancel an APPROVED request', async () => {
      await request(app.getHttpServer()).patch(`/requests/${requestId}/approve`);

      await request(app.getHttpServer())
        .patch(`/requests/${requestId}/cancel`)
        .expect(400);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('GET /requests', () => {
    it('lists requests for an employee filtered by status', async () => {
      await seedBalance('EMP-LIST', 'LOC-UK', 20);

      await request(app.getHttpServer()).post('/requests').send({
        employeeId: 'EMP-LIST', locationId: 'LOC-UK',
        daysRequested: 2, startDate: '2026-07-01', endDate: '2026-07-02',
      });

      const res = await request(app.getHttpServer())
        .get('/requests?employeeId=EMP-LIST')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOK TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /webhooks/hcm/balance-update', () => {
    it('updates local balance when HCM pushes an anniversary bonus webhook', async () => {
      await seedBalance('EMP-001', 'LOC-UK', 10);

      // HCM sends a webhook with new balance (e.g. after anniversary accrual)
      await request(app.getHttpServer())
        .post('/webhooks/hcm/balance-update')
        .send({
          eventType: 'ANNIVERSARY_ACCRUAL',
          employeeId: 'EMP-001',
          locationId: 'LOC-UK',
          balanceDays: 15, // HCM applied +5 bonus
          reason: 'Work anniversary — 5 year bonus',
        })
        .expect(200);

      // Verify local balance was updated
      const balRes = await request(app.getHttpServer())
        .get('/balances/EMP-001/LOC-UK')
        .expect(200);

      expect(balRes.body.balanceDays).toBe(15); // HCM value wins
    });

    it('ignores webhook payload missing balanceDays gracefully', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/hcm/balance-update')
        .send({
          eventType: 'UNKNOWN', employeeId: 'EMP-001', locationId: 'LOC-UK',
          // balanceDays intentionally missing
        })
        .expect(200);

      expect(res.body.message).toContain('Ignored');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY / RACE CONDITION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Concurrency & Race Conditions', () => {
    it('prevents double-spending: two simultaneous requests cannot exceed balance', async () => {
      await seedBalance('EMP-RACE', 'LOC-UK', 5);

      // Submit two requests simultaneously for 4 days each (total 8 > balance of 5)
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer()).post('/requests').send({
          employeeId: 'EMP-RACE', locationId: 'LOC-UK',
          daysRequested: 4, startDate: '2026-07-01', endDate: '2026-07-04',
        }),
        request(app.getHttpServer()).post('/requests').send({
          employeeId: 'EMP-RACE', locationId: 'LOC-UK',
          daysRequested: 4, startDate: '2026-08-01', endDate: '2026-08-04',
        }),
      ]);

      const statuses = [r1.status, r2.status];
      // At most one should succeed (201), the other should be 409 or 422
      const successCount = statuses.filter((s) => s === 201).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HCM SYNC DRIFT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HCM Balance Drift Reconciliation', () => {
    it('HCM anniversary bonus is reflected after webhook is received', async () => {
      await seedBalance('EMP-ANN', 'LOC-UK', 10);

      // HCM awards anniversary bonus (happens outside ExampleHR)
      await axios.post(`${HCM_BASE_URL}/test/anniversary`, {
        employeeId: 'EMP-ANN', locationId: 'LOC-UK', bonusDays: 3,
      });

      // ExampleHR receives webhook from HCM
      await request(app.getHttpServer())
        .post('/webhooks/hcm/balance-update')
        .send({
          eventType: 'ANNIVERSARY_ACCRUAL',
          employeeId: 'EMP-ANN',
          locationId: 'LOC-UK',
          balanceDays: 13, // HCM value: 10 + 3
        });

      // Local balance should now reflect HCM value
      const res = await request(app.getHttpServer())
        .get('/balances/EMP-ANN/LOC-UK')
        .expect(200);

      expect(res.body.balanceDays).toBe(13);
    });

    it('batch sync overwrites stale local balance with HCM values', async () => {
      // Set local cache to 10
      await seedBalance('EMP-BATCH', 'LOC-UK', 10);

      // Simulate HCM nightly batch with updated value (e.g. 18 after year-end accrual)
      await request(app.getHttpServer())
        .post('/balances/sync/batch')
        .send({ records: [{ employeeId: 'EMP-BATCH', locationId: 'LOC-UK', balanceDays: 18 }] })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/balances/EMP-BATCH/LOC-UK')
        .expect(200);

      expect(res.body.balanceDays).toBe(18); // HCM always wins
    });
  });
});
