// One deep color per player, used for their table and their player counters (p1…pN).
// All four share the saturation and lightness of the original green table, so they look alike.

export const PLAYER_HUES = [147, 0, 220, 45]; // green, red, blue, yellow

export const playerHue = (playerId: number): number => PLAYER_HUES[playerId % PLAYER_HUES.length]!;

/** Badge color of the player counter pN: the player's color, a little brighter so white text reads. */
export const playerColorHex = (playerId: number): string => `hsl(${playerHue(playerId)} 38% 30%)`;
