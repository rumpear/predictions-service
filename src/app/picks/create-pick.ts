import { parsePickInput } from '../../domain/pick-validation';
import { PicksRepository } from './picks-repository.port';

export type CreatePickResult =
  | { outcome: 'created' }
  | { outcome: 'invalid'; error: string }
  | { outcome: 'unknown_match' }
  | { outcome: 'not_open_for_picks' }
  | { outcome: 'duplicate' };

export interface CreatePickDeps {
  repository: PicksRepository;
}

export async function createPick(deps: CreatePickDeps, body: unknown): Promise<CreatePickResult> {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const { userId, matchId, type, value } = record;

  if (typeof userId !== 'string' || userId.length === 0) {
    return { outcome: 'invalid', error: 'userId must be a non-empty string' };
  }
  if (typeof matchId !== 'string' || matchId.length === 0) {
    return { outcome: 'invalid', error: 'matchId must be a non-empty string' };
  }

  const parsed = parsePickInput({ type, value });
  if (!parsed.ok) {
    return { outcome: 'invalid', error: parsed.error };
  }

  const result = await deps.repository.insertPickIfAllowed({ userId, matchId, pick: parsed.pick });

  switch (result.kind) {
    case 'created':
      return { outcome: 'created' };
    case 'rejected_unknown_match':
      return { outcome: 'unknown_match' };
    case 'rejected_not_open':
      return { outcome: 'not_open_for_picks' };
    case 'rejected_duplicate':
      return { outcome: 'duplicate' };
  }
}
