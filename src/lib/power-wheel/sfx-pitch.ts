/**
 * Pitch factor of the Power Wheel sounds by level: 2^(level/48), i.e. a quarter of an octave (about 3 semitones) higher at level 12 —
 * "a little higher the further you climb", gentle enough never to sound shrill. Level is clamped to 0..12.
 */
export function pitchFor(level: number): number {
  const k = Math.min(Math.max(Math.round(Number.isFinite(level) ? level : 0), 0), 12);
  return Math.pow(2, k / 48);
}
