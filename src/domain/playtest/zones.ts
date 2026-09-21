import type { ZoneId } from './types';

export interface ZoneRule {
  faceUp: boolean; // face state forced on entering the zone
  keepsTapped: boolean;
  keepsCounters: boolean;
  hasPosition: boolean;
}

// Adding a zone later = a new ZoneId plus a line here.
// Counters are dropped in the deck: a face-down card carrying counters would reveal what it is.
export const ZONE_RULES: Record<ZoneId, ZoneRule> = {
  deck: { faceUp: false, keepsTapped: false, keepsCounters: false, hasPosition: false },
  hand: { faceUp: true, keepsTapped: false, keepsCounters: true, hasPosition: false },
  canvas: { faceUp: true, keepsTapped: true, keepsCounters: true, hasPosition: true },
  graveyard: { faceUp: true, keepsTapped: false, keepsCounters: true, hasPosition: false },
  exile: { faceUp: true, keepsTapped: false, keepsCounters: true, hasPosition: false },
};
