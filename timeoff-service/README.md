# Time-Off Microservice

A production-quality NestJS microservice for managing employee time-off requests with bi-directional HCM synchronisation.

## Tech Stack

- **Framework:** NestJS (Node.js)
- **Database:** SQLite via TypeORM
- **Language:** TypeScript / JavaScript
- **Testing:** Jest + Supertest
- **Mock HCM:** Express.js

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env if needed (defaults work out of the box)
```

### 3. Start the mock HCM server (in a separate terminal)

```bash
npm run mock-hcm
# Starts on http://localhost:4000
```

### 4. Start the microservice

```bash
npm run start:dev
# Starts on http://localhost:3000
```

---

## Running Tests

### Unit tests (fast, no external dependencies)

```bash
npm test
```

### Unit tests with coverage report

```bash
npm run test:cov
```

### Integration tests (requires mock HCM server running)

```bash
# Terminal 1: start mock HCM
npm run mock-hcm

# Terminal 2: run integration tests
npm run test:integration
```

### Run all tests

```bash
npm run test:all
```

---

## API Reference

### Balances

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/balances/:employeeId/:locationId` | Get balance (auto-refreshes if stale) |
| `POST` | `/balances/sync/realtime` | Manually sync one employee from HCM |
| `POST` | `/balances/sync/batch` | Receive full balance corpus from HCM |

### Time-Off Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/requests` | Submit a new time-off request |
| `GET` | `/requests/:id` | Get a specific request |
| `GET` | `/requests?employeeId=X&status=Y` | List requests for an employee |
| `PATCH` | `/requests/:id/approve` | Manager approves |
| `PATCH` | `/requests/:id/reject` | Manager rejects (triggers HCM reversal) |
| `PATCH` | `/requests/:id/cancel` | Employee cancels |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/hcm/balance-update` | Receive HCM balance push (anniversary, accruals) |

---

## Example: Submit a Time-Off Request

```bash
curl -X POST http://localhost:3000/requests \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "EMP-001",
    "locationId": "LOC-UK",
    "daysRequested": 3,
    "startDate": "2026-07-01",
    "endDate": "2026-07-03"
  }'
```

**Response:**
```json
{
  "id": 1,
  "status": "AWAITING_APPROVAL",
  "hcmReferenceId": "HCM-REF-1234567890",
  "employeeId": "EMP-001",
  "locationId": "LOC-UK",
  "daysRequested": 3
}
```

## Example: Seed a Balance via Batch Sync

```bash
curl -X POST http://localhost:3000/balances/sync/batch \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      { "employeeId": "EMP-001", "locationId": "LOC-UK", "balanceDays": 10 }
    ]
  }'
```

---

## Mock HCM Test Helpers

The mock HCM server exposes test-only endpoints:

```bash
# Set a balance directly
curl -X POST http://localhost:4000/test/set-balance \
  -H "Content-Type: application/json" \
  -d '{ "employeeId": "EMP-001", "locationId": "LOC-UK", "balanceDays": 10 }'

# Simulate an anniversary bonus (HCM-side change)
curl -X POST http://localhost:4000/test/anniversary \
  -H "Content-Type: application/json" \
  -d '{ "employeeId": "EMP-001", "locationId": "LOC-UK", "bonusDays": 5 }'

# Simulate HCM failure for next N calls
curl -X POST http://localhost:4000/test/simulate-error \
  -H "Content-Type: application/json" \
  -d '{ "code": "SERVER_ERROR", "times": 2 }'

# View HCM state
curl http://localhost:4000/test/state

# Reset HCM state
curl -X POST http://localhost:4000/test/reset
```

---

## Request Status State Machine

```
PENDING → HCM_SUBMITTED → AWAITING_APPROVAL → APPROVED
                                           ↘ REJECTED
PENDING → CANCELLED
AWAITING_APPROVAL → CANCELLED (with HCM reversal)
Any → FAILED (on HCM explicit rejection)
```

---

## Architecture Decisions

See `TRD.docx` for the full Technical Requirements Document with:
- Problem analysis and key challenges
- Data model (3 SQLite tables)
- Sync strategy (real-time vs batch)
- Defensive design (3-layer HCM error handling)
- Alternatives considered

---

## Project Structure

```
timeoff-service/
├── src/
│   ├── main.ts                         # App bootstrap
│   ├── app.module.ts                   # Root module
│   ├── common/
│   │   └── filters/
│   │       └── http-exception.filter.ts
│   └── modules/
│       ├── balances/                   # Balance management
│       ├── requests/                   # Time-off request lifecycle
│       ├── sync/                       # Sync log
│       ├── webhooks/                   # HCM push notifications
│       └── hcm/                        # HCM API client
├── mock-hcm/
│   └── server.js                       # Mock HCM server (Express)
├── test/
│   ├── unit/                           # Unit tests (jest mocks)
│   └── integration/                    # Integration tests (real HTTP)
├── .env.example
├── package.json
└── README.md
```
