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
    const repo = new FakeRepository({ kind: 'applied' });

    const result = await settleMatch(
      { repository: repo },
      { matchId: 'm', eventId: 'e', homeScore: -1, awayScore: 0 },
    );

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('rejects a non-object body without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'applied' });

    const result = await settleMatch({ repository: repo }, null);

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('passes the parsed payload and raw body through to the repository', async () => {
    const repo = new FakeRepository({ kind: 'applied' });
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

  it.each([
    [{ kind: 'applied' } as const, { outcome: 'processed' }],
    [{ kind: 'duplicate' } as const, { outcome: 'processed' }],
    [{ kind: 'conflict' } as const, { outcome: 'processed' }],
    [{ kind: 'unknown_match' } as const, { outcome: 'unknown_match' }],
  ])('maps repository outcome %o to result %o', async (repoOutcome, expected) => {
    const repo = new FakeRepository(repoOutcome);

    const result = await settleMatch(
      { repository: repo },
      { matchId: 'm', eventId: 'e', homeScore: 2, awayScore: 1 },
    );

    expect(result).toEqual(expected);
  });
});
