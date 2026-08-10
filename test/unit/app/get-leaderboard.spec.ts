import { getLeaderboard } from '../../../src/app/leaderboard/get-leaderboard';
import { LeaderboardEntry, LeaderboardRepository } from '../../../src/app/leaderboard/leaderboard-repository.port';

class FakeRepository implements LeaderboardRepository {
  constructor(
    private readonly topEntries: LeaderboardEntry[],
    private readonly rankOfResult: LeaderboardEntry | null = null,
  ) {}

  top(limit: number): Promise<LeaderboardEntry[]> {
    return Promise.resolve(this.topEntries.slice(0, limit));
  }

  rankOf(): Promise<LeaderboardEntry | null> {
    return Promise.resolve(this.rankOfResult);
  }
}

describe('getLeaderboard', () => {
  it('returns the top entries with no requestedUser when no userId is given', async () => {
    const entries = [{ userId: 'u1', points: 100, rank: 1 }];
    const repo = new FakeRepository(entries);

    const result = await getLeaderboard({ repository: repo });

    expect(result).toEqual({ top: entries, requestedUser: null });
  });

  it('requests the top 20', async () => {
    let requestedLimit: number | undefined;
    const repo: LeaderboardRepository = {
      top: (limit) => {
        requestedLimit = limit;
        return Promise.resolve([]);
      },
      rankOf: () => Promise.resolve(null),
    };

    await getLeaderboard({ repository: repo });

    expect(requestedLimit).toBe(20);
  });

  it('does not look up rank when the requested user is already in the top', async () => {
    const entries = [{ userId: 'u1', points: 100, rank: 1 }];
    let rankOfCalled = false;
    const repo: LeaderboardRepository = {
      top: () => Promise.resolve(entries),
      rankOf: () => {
        rankOfCalled = true;
        return Promise.resolve(null);
      },
    };

    const result = await getLeaderboard({ repository: repo }, 'u1');

    expect(result).toEqual({ top: entries, requestedUser: null });
    expect(rankOfCalled).toBe(false);
  });

  it('looks up and returns rank when the requested user is outside the top', async () => {
    const entries = [{ userId: 'u1', points: 100, rank: 1 }];
    const requestedUser = { userId: 'u99', points: 5, rank: 42 };
    const repo = new FakeRepository(entries, requestedUser);

    const result = await getLeaderboard({ repository: repo }, 'u99');

    expect(result).toEqual({ top: entries, requestedUser });
  });

  it('returns requestedUser: null when the user has no ranking at all', async () => {
    const repo = new FakeRepository([], null);

    const result = await getLeaderboard({ repository: repo }, 'unknown-user');

    expect(result).toEqual({ top: [], requestedUser: null });
  });
});
