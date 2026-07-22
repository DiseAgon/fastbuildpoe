# External Data Sources

FastBuildPOE pulls several datasets from external services. This document lists
each source, what it feeds, and **what needs attention when a new league starts**.

> **Automated refresh:** `.github/workflows/snapshot.yml` re-runs
> `node scripts/snapshot.mjs` every 6 hours and commits `src/data/poe/` when it
> changed, so a new league (e.g. 3.29 "Curse of the Allflame", 2026-07-24) is
> picked up without manual work. If GitHub runners get Cloudflare-blocked by
> pathofexile.com, run `npm run snapshot` locally and push instead.

> TL;DR: almost everything is fetched **live and cached in memory per server run**,
> so **restarting the app picks up new-league data automatically**. Only the
> hardcoded fallbacks/ids (table below, "Hardcoded?") need manual edits, and only
> if GGG renames things — which is rare.

## Sources

| Data | Where it's used | Source | Cache | Hardcoded? | New-league action |
|---|---|---|---|---|---|
| **Trade stats** (mod text → stat id) | `lib/trade/statData.ts`, `statIndex.ts` | **Committed snapshot** `src/data/poe/stats.{poe1,poe2}.json` (via `npm run snapshot`) | bundled | Snapshot | **Re-run `npm run snapshot`** + redeploy. |
| **Leagues** (dropdown + default) | `lib/trade/meta.ts`, `league.ts` | live `GET {tradeApiBase}/data/leagues`, else snapshot `src/data/poe/meta.*.json` | in-memory + snapshot | Snapshot fallback | Live when reachable; else re-snapshot. UI also accepts a typed custom league. |
| **Divine Orb icon** | `lib/trade/meta.ts` → `DivineIcon` | snapshot `src/data/poe/meta.*.json` (from `data/static`) | bundled | Snapshot | Re-snapshot if art changes. |
| **Base weapon stats** (pDPS/eDPS/APS/crit) | `lib/trade/weaponBase.ts` → `weaponDps.ts` | PoB `Data/Bases/*.lua` (dev branch, per game repo) | in-memory, per run | No | None (auto) — PoB regenerates these each patch. |
| **pseudo stat ids** (totals) | `lib/trade/pseudo.ts` | hardcoded `pseudo.pseudo_total_*` | — | **Yes** | Verify ids still exist in `data/stats` if pseudo totals stop working. |
| **elemental resistance ids** | `lib/trade/groups.ts` | hardcoded `explicit.stat_*` | — | **Yes** | Stat ids are stable; only touch if GGG re-keys them. |
| **Stat fallback fixture** | `lib/trade/statData.ts` (`FALLBACK_POE1`) | hardcoded real ids | — | **Yes** | Only used if the live `data/stats` fetch fails; safe to leave. |

`tradeApiBase` per game (see `lib/game/registry.ts`):
- PoE1: `https://www.pathofexile.com/api/trade`
- PoE2: `https://www.pathofexile.com/api/trade2`

PoB base-data repos (dev branch) — `registry.ts` `pobRepo`:
- PoE1: `PathOfBuildingCommunity/PathOfBuilding`
- PoE2: `PathOfBuildingCommunity/PathOfBuilding-PoE2`
- Path: `src/Data/Bases/{axe,bow,claw,crossbow,dagger,flail,mace,spear,staff,sword,...}.lua`
- Format parsed: `itemBases["Name"] = { ... weapon = { PhysicalMin, PhysicalMax, CritChanceBase, AttackRateBase } ... }`

## Trade query filter group names (verify if a search filter doesn't apply)

These are **inferred** for PoE2 and should be sanity-checked by opening a generated
search and confirming the filter populates on the trade site:

| Concept | PoE1 | PoE2 |
|---|---|---|
| Armour/defence (es/ev/ar/ward) | `armour_filters` | `equipment_filters` |
| Weapon DPS (dps/pdps/edps/aps/crit) | `weapon_filters` | `equipment_filters` |
| Buy-out | `trade_filters.sale_type = "priced"` | same |

If a defence/DPS filter silently doesn't apply on PoE2, the field key or group
name there is the thing to fix (`registry.ts` + the field strings in
`queryBuilder.ts` `autoComputed`).

## How caching works (and how to force a refresh)

All live fetches cache in module-level memory and only when the fetch succeeds.
There is **no persistent cache on disk**, so:
- **Restart the server** → all datasets re-fetch (new league leagues/stats/icons,
  latest PoB base data).
- No cron or manual refresh needed for a new league beyond a restart.

## Snapshots (for cloud deploy)

Because cloud hosts (e.g. Vercel) get Cloudflare-blocked from pathofexile.com,
trade **stats** and **meta** (leagues/divine icon) are committed snapshots so the
deployed app works without live access. Regenerate from a machine that *can* reach
the API (e.g. your local PC):

```bash
npm run snapshot   # writes src/data/poe/{stats,meta}.{poe1,poe2}.json
```

Then commit + redeploy. Weapon bases (GitHub) and pobb.in are still fetched live
(those hosts aren't Cloudflare-blocked).

## Manual update checklist for a new league

1. **`npm run snapshot`** on a machine with API access, commit, redeploy.
   (Refreshes stats, leagues, divine icon.) Leagues also try live at runtime.
2. The league box accepts a typed custom league, so testers can always set the
   exact current/event league even before a re-snapshot.
3. If pseudo totals or resistance grouping break: re-verify the hardcoded ids in
   `pseudo.ts` / `groups.ts` against `{tradeApiBase}/data/stats`.
4. If a PoE2 defence/DPS filter doesn't populate: re-check the PoE2 filter group
   name / field keys (see the table above).
