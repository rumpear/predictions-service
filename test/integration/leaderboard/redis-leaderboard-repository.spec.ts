import Redis from 'ioredis';
import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { PostgresLeaderboardRepository } from '../../../src/infra/db/leaderboard-repository';
import { RedisLeaderboardRepository } from '../../../src/infra/redis/redis-leaderboard-repository';

describe('RedisLeaderboardRepository', () => {
  const testDb = useTestDatabase();
  let redis: Redis;

  beforeAll(() => {
    const url = process.env['REDIS_URL'];
    if (!url) {
      throw new Error('REDIS_URL is not set — did the integration globalSetup run?');
    }
    redis = new Redis(url);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushall();
  });

  function postgres(): PostgresLeaderboardRepository {
    return new PostgresLeaderboardRepository(testDb.db);
  }

  function repository(): RedisLeaderboardRepository {
    return new RedisLeaderboardRepository(redis, postgres(), postgres());
  }

  let matchCounter = 0;

  /** A real settlement chain, not a bare balances row — assertLedgerInvariants (I4) checks
   * balances against SUM(point_awards) after every test, so the fixture has to be real. */
  async function seedBalance(userId: string, points: number): Promise<void> {
    matchCounter += 1;
    const matchId = `redis-lb-match-${matchCounter}`;
    await testDb.db.insertInto('users').values({ id: userId }).onConflict((oc) => oc.column('id').doNothing()).execute();
    await sql`
      insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')
    `.execute(testDb.db);
    const pick = await testDb.db
      .insertInto('picks')
      .values({ user_id: userId, match_id: matchId, type: 'result', predicted_outcome: 'home' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const settlement = await testDb.db
      .insertInto('settlements')
      .values({ match_id: matchId, event_id: `${matchId}-evt`, home_score: 1, away_score: 0 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await testDb.db
      .insertInto('point_awards')
      .values({ pick_id: pick.id, settlement_id: settlement.id, user_id: userId, points })
      .execute();
    await testDb.db
      .insertInto('balances')
      .values({ user_id: userId, points: points.toString() })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({ points: eb('balances.points', '+', eb.ref('excluded.points')) })),
      )
      .execute();
  }

  it('rebuild() populates Redis from Postgres balances', async () => {
    await seedBalance('u1', 30);
    await seedBalance('u2', 20);

    await repository().rebuild();

    const top = await repository().top(20);
    expect(top).toEqual([
      { userId: 'u1', points: 30, rank: 1 },
      { userId: 'u2', points: 20, rank: 2 },
    ]);
  });

  it('breaks ties by userId ascending, matching the Postgres tie-break final term', async () => {
    await seedBalance('zzz', 10);
    await seedBalance('aaa', 10);
    await repository().rebuild();

    const top = await repository().top(20);

    expect(top).toEqual([
      { userId: 'aaa', points: 10, rank: 1 },
      { userId: 'zzz', points: 10, rank: 2 },
    ]);
  });

  it('cold start: top() rebuilds automatically when Redis has never been populated', async () => {
    await seedBalance('u1', 15);

    // no explicit rebuild() call — the sorted set has never been touched
    const top = await repository().top(20);

    expect(top).toEqual([{ userId: 'u1', points: 15, rank: 1 }]);
  });

  it('rankOf returns the correct rank for a user outside the top N', async () => {
    for (let i = 0; i < 25; i++) {
      await seedBalance(`player-${String(i).padStart(2, '0')}`, 100 - i);
    }
    await repository().rebuild();

    const result = await repository().rankOf('player-24');

    expect(result).toEqual({ userId: 'player-24', points: 76, rank: 25 });
  });

  it('increment() updates the mirror without a full rebuild', async () => {
    await seedBalance('u1', 10);
    await repository().rebuild();

    await repository().increment('u1', 5);
    // Postgres deliberately not updated here — proving this reflects the Redis increment,
    // not a rebuild from the (now stale) Postgres value.
    const top = await repository().top(20);

    expect(top).toEqual([{ userId: 'u1', points: 15, rank: 1 }]);
  });

  it('falls back to Postgres for a single user missing from an otherwise-warm mirror', async () => {
    await seedBalance('u1', 10);
    await seedBalance('drifted', 5);
    await repository().rebuild();
    await redis.zrem('leaderboard:points', 'drifted'); // simulate a missed ZINCRBY

    const result = await repository().rankOf('drifted');

    expect(result).toEqual({ userId: 'drifted', points: 5, rank: 2 });
  });

  it('falls back to Postgres entirely when Redis is unavailable', async () => {
    await seedBalance('u1', 40);
    await seedBalance('u2', 20);

    const unavailableRedis = new Redis({
      host: '127.0.0.1',
      port: 1,
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
    });
    const repo = new RedisLeaderboardRepository(unavailableRedis, postgres(), postgres());

    const top = await repo.top(20);
    expect(top).toEqual([
      { userId: 'u1', points: 40, rank: 1 },
      { userId: 'u2', points: 20, rank: 2 },
    ]);

    const rank = await repo.rankOf('u2');
    expect(rank).toEqual({ userId: 'u2', points: 20, rank: 2 });

    unavailableRedis.disconnect();
  });
});
