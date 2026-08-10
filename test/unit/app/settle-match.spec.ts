import { settleMatch } from '../../../src/app/settlement/settle-match';
import {
  SettleMatchOutcome,
  SettleMatchParams,
  SettlementRepository,
} from '../../../src/app/settlement/settlement-repository.port';

class FakeRepository implements SettlementRepository {
  public receivedParams: SettleMatchParams | undefined;

  constructor(private readonly outcome: SettleMatchOutcome) {}

  settleMatch(params: SettleMatchParams): Promise<SettleMatchOutcome> {
    this.receivedParams = params;
    return Promise.resolve(this.outcome);
  }
}

describe('settleMatch', () => {
  it('rejects an invalid payload without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'applied', awards: [] });

    const result = await settleMatch(
      { repository: repo },
      { matchId: 'm', eventId: 'e', homeScore: -1, awayScore: 0 },
    );

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('rejects a non-object body without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'applied', awards: [] });

    const result = await settleMatch({ repository: repo }, null);

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('passes the parsed payload and raw body through to the repository', async () => {
    const repo = new FakeRepository({ kind: 'applied', awards: [] });
    const body = { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 };

    await settleMatch({ repository: repo }, body);

    expect(repo.receivedParams).toEqual({
      matchId: 'm',
      eventId: 'e',
      homeScore: 2,
      awayScore: 1,
      rawPayload: body,
    });
  });

  it.each<[SettleMatchOutcome, { outcome: string }]>([
    [{ kind: 'applied', awards: [] }, { outcome: 'processed' }],
    [{ kind: 'duplicate' }, { outcome: 'processed' }],
    [{ kind: 'conflict' }, { outcome: 'processed' }],
    [{ kind: 'unknown_match' }, { outcome: 'unknown_match' }],
  ])('maps repository outcome %o to result %o', async (repoOutcome, expected) => {
    const repo = new FakeRepository(repoOutcome);

    const result = await settleMatch(
      { repository: repo },
      { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
    );

    expect(result).toEqual(expected);
  });

  describe('leaderboardUpdater (post-commit side effect)', () => {
    class FakeLeaderboardUpdater {
      public calls: Array<{ userId: string; delta: number }> = [];
      public shouldThrow = false;

      increment(userId: string, delta: number): Promise<void> {
        if (this.shouldThrow) {
          return Promise.reject(new Error('redis is down'));
        }
        this.calls.push({ userId, delta });
        return Promise.resolve();
      }
    }

    it('increments once per awarded user when the settlement is newly applied', async () => {
      const repo = new FakeRepository({
        kind: 'applied',
        awards: [
          { userId: 'u1', points: 10 },
          { userId: 'u2', points: 0 },
        ],
      });
      const updater = new FakeLeaderboardUpdater();

      await settleMatch(
        { repository: repo, leaderboardUpdater: updater },
        { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
      );

      expect(updater.calls).toEqual([
        { userId: 'u1', delta: 10 },
        { userId: 'u2', delta: 0 },
      ]);
    });

    it.each([[{ kind: 'duplicate' } as const], [{ kind: 'conflict' } as const], [{ kind: 'unknown_match' } as const]])(
      'never calls the updater for a %o outcome',
      async (repoOutcome) => {
        const repo = new FakeRepository(repoOutcome);
        const updater = new FakeLeaderboardUpdater();

        await settleMatch(
          { repository: repo, leaderboardUpdater: updater },
          { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
        );

        expect(updater.calls).toEqual([]);
      },
    );

    it('does not fail the request when the updater rejects (best-effort, self-healing via rebuild)', async () => {
      const repo = new FakeRepository({ kind: 'applied', awards: [{ userId: 'u1', points: 10 }] });
      const updater = new FakeLeaderboardUpdater();
      updater.shouldThrow = true;

      const result = await settleMatch(
        { repository: repo, leaderboardUpdater: updater },
        { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
      );

      expect(result).toEqual({ outcome: 'processed' });
    });

    it('works fine with no leaderboardUpdater provided at all', async () => {
      const repo = new FakeRepository({ kind: 'applied', awards: [{ userId: 'u1', points: 10 }] });

      const result = await settleMatch(
        { repository: repo },
        { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
      );

      expect(result).toEqual({ outcome: 'processed' });
    });
  });
});
