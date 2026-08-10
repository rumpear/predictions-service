# predictions-service

Predictions & settlement service — NestJS + PostgreSQL + Redis. Full spec in `TASK.md`, judgement calls in `ASSUMPTIONS.md`, ADRs in `DECISIONS.md`, contributor guide in `CLAUDE.md`.

Status: Phase 1 (scaffold) only. Domain logic, schema, HTTP endpoints, settlement, and leaderboard land in later phases — this section grows as they do.

## Run it

```
cp .env.example .env
docker compose up
```

This boots Postgres, Redis, and the app; the app container runs migrations before starting.

## Run the tests

```
npm install
npm test
```

Jest boots real Postgres via Testcontainers for the `integration` and `e2e` projects (no mocking the database) — nothing else to set up. Requires a working Docker daemon.

- `npm run test:unit` — pure domain logic, no I/O
- `npm run test:integration` — real Postgres, no Nest app
- `npm run test:e2e` — full Nest app + real Postgres via `supertest`
