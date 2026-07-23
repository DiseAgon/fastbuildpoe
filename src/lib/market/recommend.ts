/**
 * Flip Picks — multi-strategy flip recommendation engine.
 *
 * For every exchange-traded item it evaluates four strategies and keeps the
 * best (plus the runner-up as context):
 *
 *  1. loop D→C→item→D  — live poe.ninja mid rates, 3 trades
 *  2. loop D→item→C→D  — the same loop, reverse direction
 *  3. spread on the divine pair — buy with div low / re-sell for div high,
 *     edge from the official ledger's executed price range, 2 trades
 *  4. spread on the chaos pair — same on the chaos market
 *
 * Honest-assumption model (documented in the UI):
 *  - spreads use CAPTURE = 50% of the last hour's executed range: you will not
 *    get both extremes, you sit inside them
 *  - gaps above GAP_ARTIFACT_CAP are integer-ratio artifacts on penny items
 *    (a 1c item filling at 1:1 and 3:1 reads as "200%") and are discarded
 *  - gold fees are NOT modelled (no public API); loops pay 3 fees, spreads 2,
 *    so ties should go to the spread
 *  - every strategy is gated on real traded volume so recommendations are
 *    actually fillable
 */

import { CX_TYPES, getFlipBoard, type CxType, type FlipRow } from "./ninja";
import { getItemPairIndex, normalizeName } from "./officialCx";

const SPREAD_CAPTURE = 0.5;
/** Sustained market-making spreads live below this; bigger = one-off whale fills. */
const GAP_ARTIFACT_CAP = 60;
const MIN_SPREAD_GAP_PCT = 3;
const MIN_NET_EDGE_PCT = 0.4;
/** Official-hour mid vs live price may differ at most this much — otherwise the
 * hour was dominated by mispriced fills and its gap is not repeatable. */
const MAX_MID_DEVIATION = 0.4;
const MAX_PICKS = 30;

/**
 * Volume gates scale with the divine price — the natural yardstick of an
 * economy's size. A fresh league (divine ≈ 40-150c, day 1-3) has far smaller
 * chaos-denominated volumes than Standard (divine ≈ 1300c), so fixed
 * thresholds calibrated on Standard would filter everything out at launch.
 */
const clamp = (lo: number, v: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const minOfficialVolChaos = (divinePrice: number | null): number =>
  divinePrice && divinePrice > 0 ? clamp(300, 2.5 * divinePrice, 3000) : 500;
const minLiveVolChaos = (divinePrice: number | null): number =>
  divinePrice && divinePrice > 0 ? clamp(200, 2 * divinePrice, 2000) : 300;

export type PickStrategy = "loop-dcid" | "loop-dicd" | "spread-div" | "spread-chaos";

export const STRATEGY_LABELS: Record<PickStrategy, string> = {
  "loop-dcid": "Loop D→C→item→D",
  "loop-dicd": "Loop D→item→C→D",
  "spread-div": "Spread div pair",
  "spread-chaos": "Spread chaos pair",
};

interface Candidate {
  strategy: PickStrategy;
  /** Raw edge of the strategy in %. */
  edgePct: number;
  /** Edge after the capture haircut (spreads) — what we rank by. */
  netEdgePct: number;
  trades: 2 | 3;
  /** Chaos volume relevant to this strategy (fillability basis). */
  volumeBasisChaos: number;
  confidence: "live" | "last-hour";
}

export interface FlipPick {
  id: string;
  name: string;
  icon: string | null;
  type: CxType;
  strategy: PickStrategy;
  strategyLabel: string;
  edgePct: number;
  netEdgePct: number;
  trades: 2 | 3;
  confidence: "live" | "last-hour";
  volumeBasisChaos: number;
  /** Live chaos price for context. */
  chaosRate: number;
  depthItems: number | null;
  /** Runner-up strategy on the same item, if any survived the gates. */
  altLabel: string | null;
  altNetEdgePct: number | null;
  score: number;
}

export interface PicksBoard {
  league: string;
  divinePrice: number | null;
  officialHour: { start: number; end: number } | null;
  picks: FlipPick[];
  /** How many items were evaluated across all exchange categories. */
  evaluated: number;
  fetchedAt: number;
}

function loopCandidates(row: FlipRow, divinePrice: number): Candidate[] {
  if (row.perDivine === null || row.chaosRate <= 0) return [];
  if (row.volumeChaos < minLiveVolChaos(divinePrice)) return [];
  const fwd = (divinePrice / (row.chaosRate * row.perDivine) - 1) * 100;
  const rev = ((row.chaosRate * row.perDivine) / divinePrice - 1) * 100;
  const make = (strategy: PickStrategy, pct: number): Candidate => ({
    strategy,
    edgePct: pct,
    netEdgePct: pct,
    trades: 3,
    volumeBasisChaos: row.volumeChaos,
    confidence: "live",
  });
  const out: Candidate[] = [];
  if (fwd > 0) out.push(make("loop-dcid", fwd));
  if (rev > 0) out.push(make("loop-dicd", rev));
  return out;
}

function spreadCandidate(
  strategy: PickStrategy,
  gapPct: number | null,
  volumeChaos: number | null,
  officialMid: number | null,
  liveMid: number | null,
  divinePrice: number | null,
): Candidate | null {
  if (gapPct === null || gapPct < MIN_SPREAD_GAP_PCT || gapPct > GAP_ARTIFACT_CAP) return null;
  if (volumeChaos === null || volumeChaos < minOfficialVolChaos(divinePrice)) return null;
  // Consistency check: if the hour's executed mid sits far from today's live
  // price, the "gap" was a transient mispricing, not a standing spread.
  if (officialMid !== null && liveMid !== null && liveMid > 0) {
    const deviation = Math.abs(officialMid - liveMid) / liveMid;
    if (deviation > MAX_MID_DEVIATION) return null;
  }
  return {
    strategy,
    edgePct: gapPct,
    netEdgePct: gapPct * SPREAD_CAPTURE,
    trades: 2,
    volumeBasisChaos: volumeChaos,
    confidence: "last-hour",
  };
}

/** Rank = edge that survives assumptions × how much money actually flows. */
const scoreOf = (c: Candidate): number => c.netEdgePct * Math.log10(1 + c.volumeBasisChaos);

export async function getFlipPicks(league: string): Promise<PicksBoard | null> {
  const [official, ...boards] = await Promise.all([
    getItemPairIndex(league).catch(() => null),
    ...CX_TYPES.map((t) => getFlipBoard(league, t)),
  ]);

  const present = boards.filter((b): b is NonNullable<typeof b> => b !== null);
  if (present.length === 0) return null;
  const divinePrice = present.find((b) => b.divinePrice !== null)?.divinePrice ?? null;

  const picks: FlipPick[] = [];
  let evaluated = 0;
  for (const board of present) {
    for (const row of board.rows) {
      evaluated++;
      const info = official?.byName.get(normalizeName(row.name));
      // Live divine-per-item = 1 / (items per divine), for the mid sanity check.
      const liveDivPerItem =
        row.perDivine !== null && row.perDivine > 0 ? 1 / row.perDivine : null;
      const candidates: Candidate[] = [
        ...(divinePrice !== null ? loopCandidates(row, divinePrice) : []),
        spreadCandidate(
          "spread-div",
          info?.divineGapPct ?? null,
          divineVolChaos(info?.volumeDiv1h ?? null, divinePrice),
          info?.divineMid ?? null,
          liveDivPerItem,
          divinePrice,
        ),
        spreadCandidate(
          "spread-chaos",
          info?.chaosGapPct ?? null,
          info?.volumeChaos1h ?? null,
          info?.chaosMid ?? null,
          row.chaosRate,
          divinePrice,
        ),
      ].filter((c): c is Candidate => c !== null && c.netEdgePct >= MIN_NET_EDGE_PCT);
      if (candidates.length === 0) continue;

      const ranked = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a));
      const best = ranked[0];
      const alt = ranked[1] ?? null;
      picks.push({
        id: `${board.type}-${row.id}`,
        name: row.name,
        icon: row.image,
        type: board.type,
        strategy: best.strategy,
        strategyLabel: STRATEGY_LABELS[best.strategy],
        edgePct: best.edgePct,
        netEdgePct: best.netEdgePct,
        trades: best.trades,
        confidence: best.confidence,
        volumeBasisChaos: best.volumeBasisChaos,
        chaosRate: row.chaosRate,
        depthItems: info?.depthItems ?? null,
        altLabel: alt ? STRATEGY_LABELS[alt.strategy] : null,
        altNetEdgePct: alt ? alt.netEdgePct : null,
        score: scoreOf(best),
      });
    }
  }

  picks.sort((a, b) => b.score - a.score);
  return {
    league,
    divinePrice,
    officialHour: official ? { start: official.hourStart, end: official.hourEnd } : null,
    picks: picks.slice(0, MAX_PICKS),
    evaluated,
    fetchedAt: Date.now(),
  };
}

function divineVolChaos(volumeDiv: number | null, divinePrice: number | null): number | null {
  if (volumeDiv === null || divinePrice === null) return null;
  return volumeDiv * divinePrice;
}
