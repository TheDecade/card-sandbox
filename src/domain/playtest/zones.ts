import type { ZoneId } from './types';

export interface ZoneRule {
  faceUp: boolean; // face state forced on entering the zone
  keepsTapped: boolean;
  hasPosition: boolean;
}

// Adding a zone later = a new ZoneId plus a line here.
// What happens to counters on a zone change is a playtest rule (PlaytestRules.countersPersist).
export const ZONE_RULES: Record<ZoneId, ZoneRule> = {
  deck: { faceUp: false, keepsTapped: false, hasPosition: false },
  hand: { faceUp: true, keepsTapped: false, hasPosition: false },
  canvas: { faceUp: true, keepsTapped: true, hasPosition: true },
  graveyard: { faceUp: true, keepsTapped: false, hasPosition: false },
  exile: { faceUp: true, keepsTapped: false, hasPosition: false },
};
