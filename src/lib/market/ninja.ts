/**
 * poe.ninja Currency Exchange (in-game auction house) data.
 *
 * Endpoint: /poe1/api/economy/exchange/current/overview?league=&type=
 * Each line quotes an item two ways:
 *  - primaryValue: chaos per item (the chaos leg)
 *  - maxVolumeRate: items per 1 unit of maxVolumeCurrency (usually the divine leg)
 * The divergence between the two legs is the triangular-arbitrage opportunity:
 * chaos → divine → item → chaos (or the reverse), all inside the exchange.
 *
 * Upstream responses are HTTP-cached ~5 minutes; we cache the same server-side.
 * NOTE: the API is public but unversioned — shapes can change between leagues.
 */

const NINJA_BASE = "https://poe.ninja/poe1/api/economy";
const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_AGENT = process.env.APP_USER_AGENT ?? "FastBuildPOE/0.1 (+https://fastbuildpoe.xyz)";

/** Exchange categories the flip board supports (poe.ninja `type` values). */
export const CX_TYPES = [
  "Currency",
  "Fragment",
  "Scarab",
  "Essence",
  "Oil",
  "DeliriumOrb",
  "Fossil",
  "Resonator",
  "DivinationCard",
  "Omen",
  "Tattoo",
  "AllflameEmber",
] as const;
export type CxType = (typeof CX_TYPES)[number];
export const isCxType = (v: string): v is CxType => (CX_TYPES as readonly string[]).includes(v);

interface NinjaLine {
  id: string;
  primaryValue?: number;
  volumePrimaryValue?: number;
  maxVolumeCurrency?: string;
  maxVolumeRate?: number;
  sparkline?: { totalChange?: number | null; data?: Array<number | null> };
}

interface NinjaItemMeta {
  id: string;
  name?: string;
  image?: string;
  category?: string;
}

interface NinjaOverview {
  lines?: NinjaLine[];
  core?: { items?: NinjaItemMeta[] };
  items?: NinjaItemMeta[];
}

/** One row of the flip board, fully computed server-side. */
export interface FlipRow {
  id: string;
  name: string;
  /** Absolute icon URL (poe CDN via poe.ninja), if known. */
  image: string | null;
  /** Chaos per item on the chaos pair. */
  chaosRate: number;
  /** Items per 1 divine on the divine pair (null when the item trades mostly vs chaos). */
  perDivine: number | null;
  /** Chaos-equivalent price of the divine leg (divinePrice / perDivine). */
  divineLegChaos: number | null;
  /**
   * Profit % of one full flip loop, anchored in divines.
   * Positive: divine→chaos→item→divine (buy chaos with div, buy item with
   * chaos, sell item back to divines). Negative: the reverse route
   * (divine→item→chaos→divine) is the profitable one, at |loopPct|%.
   */
  loopPct: number | null;
  /** Traded volume in chaos-equivalent (liquidity filter). */
  volumeChaos: number;
  /** 7-day % change of the item's price. */
  trend7d: number | null;
  sparkline: Array<number | null>;
}

export interface FlipBoard {
  league: string;
  type: CxType;
  /** Chaos per divine on the exchange. */
  divinePrice: number | null;
  rows: FlipRow[];
  fetchedAt: number;
}

const cache = new Map<string, { value: unknown; expires: number }>();

async function getJson<T>(url: string): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const json = (await res.json()) as T;
    cache.set(url, { value: json, expires: Date.now() + CACHE_TTL_MS });
    return json;
  } catch {
    return null;
  }
}

function overviewUrl(league: string, type: CxType): string {
  const params = new URLSearchParams({ league, type });
  return `${NINJA_BASE}/exchange/current/overview?${params}`;
}

/** Leagues poe.ninja currently tracks for the PoE1 economy. */
export async function getEconomyLeagues(): Promise<string[]> {
  const json = await getJson<Array<{ id?: string }>>(`${NINJA_BASE}/leagues`);
  const ids = (json ?? []).map((l) => l.id).filter((id): id is string => !!id);
  return ids.length > 0 ? ids : ["Standard", "Hardcore"];
}

/** Chaos-per-divine from the Currency overview's divine line. */
function divinePriceOf(currency: NinjaOverview | null): number | null {
  const line = currency?.lines?.find((l) => l.id === "divine");
  return line?.primaryValue && line.primaryValue > 0 ? line.primaryValue : null;
}

export async function getFlipBoard(league: string, type: CxType): Promise<FlipBoard | null> {
  const [overview, currency] = await Promise.all([
    getJson<NinjaOverview>(overviewUrl(league, type)),
    getJson<NinjaOverview>(overviewUrl(league, "Currency")),
  ]);
  if (!overview?.lines) return null;

  const divinePrice = divinePriceOf(currency);
  // Metadata is split: core.items holds the primary currencies (chaos/divine),
  // the top-level items array holds the requested category's entries.
  const meta = new Map<string, NinjaItemMeta>();
  for (const m of [...(overview.core?.items ?? []), ...(overview.items ?? [])]) {
    meta.set(m.id, m);
  }

  const rows: FlipRow[] = [];
  for (const line of overview.lines) {
    if (line.id === "chaos" || line.id === "divine") continue;
    const chaosRate = line.primaryValue ?? 0;
    if (chaosRate <= 0) continue;

    const hasDivineLeg =
      line.maxVolumeCurrency === "divine" && !!line.maxVolumeRate && line.maxVolumeRate > 0;
    const perDivine = hasDivineLeg ? line.maxVolumeRate! : null;
    const divineLegChaos =
      perDivine !== null && divinePrice !== null ? divinePrice / perDivine : null;
    // divine → chaos → item → divine: 1 div buys divinePrice chaos, which buys
    // divinePrice/chaosRate items, which sell back at perDivine items per div.
    // Factor > 1 means the loop ends with more divines than it started with;
    // < 1 means the reverse route (divine→item→chaos→divine) is the winner.
    const loopPct =
      perDivine !== null && divinePrice !== null
        ? (divinePrice / (chaosRate * perDivine) - 1) * 100
        : null;

    const m = meta.get(line.id);
    rows.push({
      id: line.id,
      name: m?.name ?? line.id,
      image: m?.image ? `https://web.poecdn.com${m.image}` : null,
      chaosRate,
      perDivine,
      divineLegChaos,
      loopPct,
      volumeChaos: line.volumePrimaryValue ?? 0,
      trend7d: line.sparkline?.totalChange ?? null,
      sparkline: line.sparkline?.data ?? [],
    });
  }

  return { league, type, divinePrice, rows, fetchedAt: Date.now() };
}
