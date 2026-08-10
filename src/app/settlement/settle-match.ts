import { parseMatchFinishedPayload } from '../../domain/webhook-validation';
import { SettlementRepository } from './settlement-repository.port';

export type SettleMatchResult =
  | { outcome: 'processed' }
  | { outcome: 'invalid'; error: string }
  | { outcome: 'unknown_match' };

export interface SettleMatchDeps {
  repository: SettlementRepository;
}

export async function settleMatch(deps: SettleMatchDeps, body: unknown): Promise<SettleMatchResult> {
  const parsed = parseMatchFinishedPayload(body);
  if (!parsed.ok) {
    return { outcome: 'invalid', error: parsed.error };
  }

  const result = await deps.repository.settleMatch({ ...parsed.payload, rawPayload: body });

  switch (result.kind) {
    case 'applied':
    case 'duplicate':
    case 'conflict':
      return { outcome: 'processed' };
    case 'unknown_match':
      return { outcome: 'unknown_match' };
  }
}
