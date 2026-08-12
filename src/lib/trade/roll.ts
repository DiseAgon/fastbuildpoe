/**
 * How good a match has to be, as a percentage of the item's own roll.
 *
 * Replaces the old Min-max / As-is / Budget presets. Those bundled three
 * unrelated decisions — roll threshold, whether mods were required or optional,
 * and whether corrupted items were excluded — behind one word, so the only way
 * to ask for "the same item but 10% cheaper rolls" was to jump a whole preset.
 * A single axis says exactly one thing: a filter's minimum is this share of
 * what the item has.
 *
 * 100% means "at least as good as this item". Values up to 120% search for an
 * upgrade. 0% removes the roll floor entirely and searches on the mods alone.
 *
 * Lives apart from `queryBuilder` so the client can import the default without
 * pulling the stat index and its data files into the browser bundle.
 */
export const DEFAULT_ROLL_PERCENT = 80;

export const MIN_ROLL_PERCENT = 0;
export const MAX_ROLL_PERCENT = 120;

/** Slider granularity — fine enough to tune, coarse enough to hit by mouse. */
export const ROLL_PERCENT_STEP = 5;

export function clampRollPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ROLL_PERCENT;
  return Math.min(MAX_ROLL_PERCENT, Math.max(MIN_ROLL_PERCENT, Math.round(value)));
}
