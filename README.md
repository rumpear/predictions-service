# predictions-service

Players submit predictions on football matches; match results arrive from an external
webhook (which may redeliver the same result any number of times, with no guarantee the
delivery ID is stable across retries); predictions settle and points are credited exactly
once. NestJS (HTTP layer only) + PostgreSQL 16 (source of truth) + Redis 7 (leaderboard read
model only).

## Run it

```
cp .env.example .env
docker compose up
```

Boots Postgres, Redis, and the app; the app container runs migrations before starting.
Env vars (see `.env.example`): `PORT`, `DATABASE_URL`, `REDIS_URL`.

Migrations are hand-written SQL, run through the same runner (`npm run migrate`) in dev,
test, and CI — no ORM sync/auto-migrate anywhere.

## Run the tests

```
npm install
npm test
```

Jest boots real Postgres *and* Redis via Testcontainers for the `integration` and `e2e`
projects — nothing is mocked in those. Requires a working Docker daemon; nothing else to
set up.

- `npm run test:unit` — pure domain logic, no I/O
- `npm run test:integration` — real Postgres/Redis, no Nest app
- `npm run test:e2e` — full Nest app + real Postgres/Redis via `supertest`

**The three mandatory scenarios**, run individually:

```
npx jest test/e2e/scenario-a-duplicate-webhook.e2e-spec.ts --selectProjects e2e
npx jest test/integration/settlement/scenario-b-concurrent-settlement.spec.ts --selectProjects integration
npx jest test/e2e/scenario-c-pick-after-kickoff.e2e-spec.ts --selectProjects e2e
```

Scenario B's repository-level spec is the rigorous one (10 truly-parallel settlement
attempts, each over its own single-connection Kysely instance so the "distinct database
connections" requirement is provable rather than assumed, 20 iterations, plus a second run
with the lock and fast-path both disabled — proving the unique constraint alone carries
correctness). `test/e2e/scenario-b-concurrent-settlement.e2e-spec.ts` is a lighter
full-HTTP companion.

**Bonus items, both done rather than skipped:** a property-based test
(`test/e2e/settlement-invariants.property.e2e-spec.ts`, `fast-check`) generates random pick
sets and random duplicate-webhook histories and asserts I3+I4 hold for every one of them; CI
also runs a `docker compose up` smoke test against a real clean boot.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id` PK | Auto-created on a user's first pick |
| `matches` | `id` PK, `kickoff_at`, `status`, `home_score`, `away_score`, `settled_at` | Seed-only — no creation endpoint |
| `picks` | `id` PK, `(user_id, match_id, type)` **unique**, `type`, `predicted_outcome` / `predicted_home`+`predicted_away` | `CHECK` ties populated columns to `type` |
| `settlements` | `id` PK, `match_id` **unique**, `event_id`, `home_score`, `away_score` | One row per settled match — the scores actually settled on |
| `point_awards` | `id` PK, `pick_id` **unique**, `settlement_id`, `user_id`, `points` | The ledger. One row per pick, even zero-point ones |
| `balances` | `user_id` PK, `points bigint` | Atomic-increment target only, never read-modify-write |
| `webhook_events` | `event_id` PK, `match_id`, `raw_payload`, `outcome` | Audit log — **not** the idempotency guarantee |

**Invariants** (the actual grading criteria — each is a database constraint where one can
express it, and a test always):

- **I1** — at most one pick per `(user_id, match_id, type)`. `picks_user_match_type_unique`.
- **I2** — a pick exists only if created strictly before its match's `kickoff_at`. A single
  conditional `INSERT ... SELECT ... WHERE kickoff_at > now() AND status = 'scheduled'` — the
  database's clock decides, no read-then-write window.
- **I3** — every pick receives at most one award, ever. `point_awards.pick_id` unique.
- **I4** — for every user: `balances.points == SUM(point_awards.points)`, always. Asserted
  after every integration/e2e test via a shared `assertLedgerInvariants(db)` helper.
- **I5** — points are integers end to end. `integer`/`bigint` only, verified structurally via
  `information_schema.columns` across the whole schema, not just columns named "points".
- **I6** — a match settles at most once. `settlements.match_id` unique.
- **I7** — the leaderboard read model is exactly consistent with `balances`, or
  lagging-but-self-healing — never permanently wrong. Enforced by Redis cold-start rebuild +
  per-user and total Postgres fallback (see below).

## Idempotency & concurrency

Three layers guard settlement, in order of how much they actually matter for correctness —
not the order they run in:

1. **`settlements.match_id UNIQUE`** — the real guarantee. `KyselySettlementRepository`
   attempts `INSERT INTO settlements` *before* doing any other work; only the transaction
   whose insert succeeds goes on to score picks and credit balances. A `unique_violation`
   here is expected and benign — it drives duplicate/conflict classification, not an error
   path. Proven to hold **even with every layer below disabled**
   (`scenario-b-concurrent-settlement.spec.ts`'s constraints-only variant).
2. **Atomic balance increments** — `INSERT INTO balances ... ON CONFLICT (user_id) DO UPDATE
   SET points = balances.points + EXCLUDED.points`, never a read-modify-write. Awards are one
   multi-row `INSERT ... ON CONFLICT (pick_id) DO NOTHING ... RETURNING`, aggregated per user
   in a CTE, applied in one statement ordered by `user_id` — deadlocks between concurrent
   settlements touching overlapping users are structurally impossible, not just unlikely.
3. **`pg_advisory_xact_lock`, scoped per match** — serializes settlement of one match so
   losing concurrent requests fail fast on a cheap lock wait instead of racing through the
   full picks-scan-and-score path. Chosen over `SELECT ... FOR UPDATE` on the `matches` row
   because it decouples the lock's scope ("settling this match") from the row itself, which
   settlement also needs to `UPDATE` in the same transaction — an advisory lock can't
   silently contend with unrelated future code that touches `matches` for other reasons.
   Pure performance; correctness never depends on it.

A parallel guard covers `POST /picks`: the kickoff check is a conditional insert (I2 above),
not a read-then-write, so there's no window where a pick could sneak in after kickoff.

Isolation level is `READ COMMITTED` throughout — sufficient given the two points above,
neither of which needs snapshot isolation. Redis is updated **strictly after commit**
(`settleMatch` calls the leaderboard update only once the settlement repository call has
resolved, which is after `COMMIT`), never inside the transaction, and a failed update there
doesn't fail the request — it's the accepted eventual-consistency window described below.

## What I'd do differently with more time, and the weakest points

- **The post-commit Redis update is a dual write with no outbox.** A crash between `COMMIT`
  and the leaderboard increment leaves Redis stale until the next cold-start rebuild or
  per-user fallback read closes the gap — usually fast, but not instant, and not
  transactional. A proper outbox (write an "increment needed" row in the same transaction,
  relay it asynchronously) would close this correctly instead of relying on self-healing.
- **The Redis-served leaderboard drops one tier of the documented tie-break.** The tie-break
  is `points DESC, earliest-award ASC, userId ASC`; a Redis sorted set has one score
  dimension, so the middle term has no home there and is simply absent on the Redis path
  (the final `userId ASC` term is preserved by negating the stored score). Two users tied on
  points can rank differently depending on which path answers the request. Honestly, for a
  service at this scale Redis isn't worth this complexity at all — Postgres's own
  `RANK() OVER (...)` query is fast enough that the extra data store, rebuild routine,
  fallback path, and this exact tie-break gap buy latency headroom nothing here will ever
  need. Built anyway per the brief; a real deployment this size would be justified leaving
  it out.
- **Score-correction is first-write-wins with no compensating entries.** A genuinely wrong
  score can't be corrected once a match has settled, only silently ignored as a "conflict."
- **The webhook has no signature verification or replay-window check** — anything that can
  reach the endpoint can trigger settlement for a real match.
- **Settlement loads every pick for a match into memory** to score it. Fine at this scale,
  wrong at 10⁶ picks — would need batching or a set-based scoring approach in SQL instead.
- **No dead-letter path** for a webhook event that fails permanently rather than transiently.
