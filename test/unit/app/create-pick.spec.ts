import { createPick } from '../../../src/app/picks/create-pick';
import { InsertPickOutcome, InsertPickParams, PicksRepository } from '../../../src/app/picks/picks-repository.port';

class FakeRepository implements PicksRepository {
  public receivedParams: InsertPickParams | undefined;

  constructor(private readonly outcome: InsertPickOutcome) {}

  insertPickIfAllowed(params: InsertPickParams): Promise<InsertPickOutcome> {
    this.receivedParams = params;
    return Promise.resolve(this.outcome);
  }
}

describe('createPick', () => {
  it('rejects a missing userId without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    const result = await createPick({ repository: repo }, { matchId: 'm', type: 'result', value: 'home' });

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('rejects a missing matchId without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    const result = await createPick({ repository: repo }, { userId: 'u', type: 'result', value: 'home' });

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('rejects a type/value mismatch without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    const result = await createPick(
      { repository: repo },
      { userId: 'u', matchId: 'm', type: 'result', value: '2:1' },
    );

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('rejects a non-object body without touching the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    const result = await createPick({ repository: repo }, null);

    expect(result).toEqual({ outcome: 'invalid', error: expect.any(String) });
    expect(repo.receivedParams).toBeUndefined();
  });

  it('passes a parsed result pick through to the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    await createPick({ repository: repo }, { userId: 'u', matchId: 'm', type: 'result', value: 'home' });

    expect(repo.receivedParams).toEqual({
      userId: 'u',
      matchId: 'm',
      pick: { type: 'result', predictedOutcome: 'home' },
    });
  });

  it('passes a parsed exact pick through to the repository', async () => {
    const repo = new FakeRepository({ kind: 'created', pickId: 'x' });

    await createPick({ repository: repo }, { userId: 'u', matchId: 'm', type: 'exact', value: '2:1' });

    expect(repo.receivedParams).toEqual({
      userId: 'u',
      matchId: 'm',
      pick: { type: 'exact', predictedHome: 2, predictedAway: 1 },
    });
  });

  it.each([
    [{ kind: 'created', pickId: 'x' } as const, { outcome: 'created' }],
    [{ kind: 'rejected_unknown_match' } as const, { outcome: 'unknown_match' }],
    [{ kind: 'rejected_not_open' } as const, { outcome: 'not_open_for_picks' }],
    [{ kind: 'rejected_duplicate' } as const, { outcome: 'duplicate' }],
  ])('maps repository outcome %o to result %o', async (repoOutcome, expected) => {
    const repo = new FakeRepository(repoOutcome);

    const result = await createPick(
      { repository: repo },
      { userId: 'u', matchId: 'm', type: 'result', value: 'home' },
    );

    expect(result).toEqual(expected);
  });
});
