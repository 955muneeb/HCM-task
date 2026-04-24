/**
 * Mock HCM Server
 * ───────────────
 * Simulates a real HCM system (Workday / SAP) for local development and integration testing.
 * Supports:
 *   - GET  /api/balances          - fetch single employee+location balance
 *   - POST /api/requests          - submit a time-off deduct or reverse
 *   - POST /api/batch-balances    - receive full balance corpus
 *   - POST /test/set-balance      - test helper to set a balance directly
 *   - POST /test/simulate-error   - test helper to force next call to fail
 *   - POST /test/anniversary      - simulate an HCM-side anniversary bonus
 *   - GET  /test/state            - inspect current HCM state
 *   - POST /test/reset            - reset all state to initial
 */

const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.HCM_PORT || 4000;
const API_KEY = process.env.HCM_API_KEY || 'mock-hcm-api-key-secret';

// ── In-memory state ───────────────────────────────────────────────────────────
// balances[employeeId][locationId] = number
let balances = {};

// Submitted requests log
let requestLog = [];

// Force-error configuration for testing
let forceError = null; // { code: 'NETWORK' | 'HCM_REJECT', message: '', times: 1 }
let errorCallCount = 0;

// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
  }
  next();
}

// ── Error simulation middleware ───────────────────────────────────────────────
function errorSimMiddleware(req, res, next) {
  if (forceError && req.path.startsWith('/api')) {
    if (errorCallCount < forceError.times) {
      errorCallCount++;
      if (forceError.code === 'NETWORK') {
        // Simulate network timeout by destroying the socket
        req.socket.destroy();
        return;
      }
      if (forceError.code === 'HCM_REJECT') {
        return res.status(422).json({
          errorCode: forceError.errorCode || 'INSUFFICIENT_BALANCE',
          errorMessage: forceError.message || 'HCM rejected the request',
        });
      }
      if (forceError.code === 'SILENT_FAIL') {
        // Simulate HCM accepting but not returning referenceId (unreliable response)
        return res.status(200).json({ success: true });
      }
      if (forceError.code === 'SERVER_ERROR') {
        return res.status(500).json({ message: 'Internal HCM error' });
      }
    } else {
      forceError = null;
      errorCallCount = 0;
    }
  }
  next();
}

app.use(errorSimMiddleware);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getBalance(employeeId, locationId) {
  return (balances[employeeId] && balances[employeeId][locationId] !== undefined)
    ? balances[employeeId][locationId]
    : null;
}

function setBalance(employeeId, locationId, value) {
  if (!balances[employeeId]) balances[employeeId] = {};
  balances[employeeId][locationId] = Math.max(0, parseFloat(value.toFixed(4)));
}

// ── API Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/balances?employeeId=X&locationId=Y
 * Returns the current balance for an employee at a location.
 */
app.get('/api/balances', authMiddleware, (req, res) => {
  const { employeeId, locationId } = req.query;

  if (!employeeId || !locationId) {
    return res.status(400).json({ error: 'employeeId and locationId are required' });
  }

  const balance = getBalance(employeeId, locationId);

  if (balance === null) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: `No balance record for employee=${employeeId}, location=${locationId}`,
    });
  }

  return res.json({
    employeeId,
    locationId,
    balanceDays: balance,
    currency: 'DAYS',
    asOf: new Date().toISOString(),
  });
});

/**
 * POST /api/requests
 * Processes a time-off request (DEDUCT or REVERSE).
 * Simulates HCM-side validation: insufficient balance returns 422.
 */
app.post('/api/requests', authMiddleware, (req, res) => {
  const { employeeId, locationId, daysRequested, startDate, endDate, requestType } = req.body;

  if (!employeeId || !locationId || !daysRequested || !requestType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const current = getBalance(employeeId, locationId);

  if (current === null) {
    return res.status(404).json({
      errorCode: 'EMPLOYEE_NOT_FOUND',
      errorMessage: `No HCM record for employee=${employeeId}, location=${locationId}`,
    });
  }

  if (requestType === 'DEDUCT') {
    if (current < daysRequested) {
      return res.status(422).json({
        errorCode: 'INSUFFICIENT_BALANCE',
        errorMessage: `Insufficient balance. Available: ${current}, Requested: ${daysRequested}`,
        available: current,
        requested: daysRequested,
      });
    }
    setBalance(employeeId, locationId, current - daysRequested);
  } else if (requestType === 'REVERSE') {
    setBalance(employeeId, locationId, current + daysRequested);
  } else {
    return res.status(400).json({ error: `Unknown requestType: ${requestType}` });
  }

  const referenceId = `HCM-REF-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

  requestLog.push({
    referenceId,
    employeeId,
    locationId,
    daysRequested,
    requestType,
    startDate,
    endDate,
    balanceAfter: getBalance(employeeId, locationId),
    processedAt: new Date().toISOString(),
  });

  return res.status(200).json({
    success: true,
    referenceId,
    message: `${requestType} processed successfully`,
    newBalance: getBalance(employeeId, locationId),
  });
});

/**
 * POST /api/batch-balances
 * Accepts a full corpus of balances (simulates HCM nightly batch push).
 */
app.post('/api/batch-balances', authMiddleware, (req, res) => {
  const { records } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records must be an array' });
  }

  let processed = 0;
  for (const r of records) {
    if (r.employeeId && r.locationId && r.balanceDays !== undefined) {
      setBalance(r.employeeId, r.locationId, r.balanceDays);
      processed++;
    }
  }

  return res.json({
    message: 'Batch processed',
    processed,
    total: records.length,
  });
});

// ── Test Helper Routes (only used in test suite) ──────────────────────────────

/**
 * POST /test/set-balance
 * Directly set a balance for testing.
 */
app.post('/test/set-balance', (req, res) => {
  const { employeeId, locationId, balanceDays } = req.body;
  setBalance(employeeId, locationId, balanceDays);
  return res.json({ message: 'Balance set', employeeId, locationId, balanceDays });
});

/**
 * POST /test/simulate-error
 * Force the next N calls to /api/* to fail in a specific way.
 * code: 'NETWORK' | 'HCM_REJECT' | 'SILENT_FAIL' | 'SERVER_ERROR'
 */
app.post('/test/simulate-error', (req, res) => {
  const { code, message, errorCode, times = 1 } = req.body;
  forceError = { code, message, errorCode, times };
  errorCallCount = 0;
  return res.json({ message: `Will simulate ${code} for next ${times} API call(s)` });
});

/**
 * POST /test/anniversary
 * Simulate HCM awarding a work anniversary bonus directly.
 * The microservice would receive this via webhook in production.
 */
app.post('/test/anniversary', (req, res) => {
  const { employeeId, locationId, bonusDays } = req.body;
  const current = getBalance(employeeId, locationId) || 0;
  setBalance(employeeId, locationId, current + bonusDays);
  return res.json({
    message: `Anniversary bonus applied: +${bonusDays} days`,
    employeeId,
    locationId,
    previousBalance: current,
    newBalance: getBalance(employeeId, locationId),
  });
});

/**
 * GET /test/state
 * Inspect entire current HCM state (balances + request log).
 */
app.get('/test/state', (req, res) => {
  return res.json({ balances, requestLog });
});

/**
 * POST /test/reset
 * Reset all state (used in test beforeEach hooks).
 */
app.post('/test/reset', (req, res) => {
  balances = {};
  requestLog = [];
  forceError = null;
  errorCallCount = 0;
  return res.json({ message: 'HCM state reset' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Mock HCM Server running on http://localhost:${PORT}`);
    console.log(`API Key: ${API_KEY}`);
    console.log(`Test helpers available at /test/*`);
  });
}

module.exports = { app };
