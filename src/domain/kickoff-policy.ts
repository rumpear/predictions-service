import { Clock } from './clock';

export function isPickAllowed(clock: Clock, kickoffAt: Date): boolean {
  return clock.now().getTime() < kickoffAt.getTime();
}
