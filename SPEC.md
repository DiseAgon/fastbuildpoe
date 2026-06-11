# FastBuildPOE — Specification (living document)

> Import a Path of Exile build (pobb.in / PoB code) and generate, for **every item**,
> a tunable official trade-search **link** that finds **similar** items — not 100% exact —
> with optional on-demand price fetching. PoE 1 first, PoE 2 right after.

Status: **planning / requirements capture** (no implementation yet).
This file is the source of truth. It is appended to as new rules are layered in.

---

## 1. Core principles

- **Similar, not identical.** Exact-roll searches return zero results. The default behavior
  is a *fuzzy* search that finds comparable items; strictness is fully in the client's hands.
- **Client-driven options.** Every loosening/tightening feature is an optional, toggleable
  control. Defaults are sensible; the user can always override.
- **Links first, prices optional.** Always produce a clickable trade URL. Price fetching is
  explicit, on-demand, per item (rate-limit safety).
- **Game-agnostic core.** PoE1 and PoE2 share the pipeline; differences live behind a registry.

## 2. Decisions locked

| Topic | Decision |
|---|---|
| Platform | Next.js full-stack web (App Router, TypeScript) |
| Output | Trade links first + optional on-demand price fetch |
| Mod strategy | Smart, tunable subset (fuzzy by default) |
| Game scope | PoE1 first, PoE2 immediately after |
| API access | All PoE calls server-side only (CORS/Cloudflare/rate limits) |
| Default league | **Current challenge league** (auto-detected from `data/leagues`), per game |
| Game switch | Global **PoE1 / PoE2 toggle** in the header; drives endpoints, leagues, stats |
| Package manager | npm (pnpm unavailable in env: corepack symlink perms) |
| Styling | Tailwind v3 + CSS custom-property design tokens |

## 3. Architecture

```
Browser (React UI) ──► Next.js API routes (server-only) ──► PoE official APIs
                                                       └──► cached data (stats, tiers, bases)
```
Browser never calls pathofexile.com directly.

## 3.1 UX & visual direction

Goal: **easy to use, but intentional and good-looking** — not a default template.

- **Single-screen flow**: paste pobb.in link → items appear as cards → click a link / tweak / fetch price. Minimal steps, no deep navigation.
- **Header**: app name, the **PoE1 ⇄ PoE2 toggle**, and the **league selector** (defaults to the current challenge league for the active game; remembered per session).
- **Game toggle** is global state — switching it reloads the correct registry (endpoints, league list, stat DB, tier/base data) and re-generates links.
- **Item cards**: rarity-colored names (normal/magic/rare/unique), base-tier badge (§6), mod list with the tunable filter panel (§5), the trade link, budget-axis switch (min-max / as-is / budget, §7), and an on-demand "fetch price" button.
- **Visual direction**: PoE-appropriate **dark editorial** — deep neutral background, parchment/gold accents, the game's rarity palette used *semantically* (not decoration). Clear hierarchy via scale contrast, designed hover/focus/active states, restrained compositor-friendly motion. Respect `prefers-reduced-motion`. Two breakpoints minimum (mobile + desktop).
- **Ease-of-use guardrails**: sensible defaults so a user can paste-and-go without touching any toggle; advanced controls (groups, bands, budget) are progressively disclosed, not in the way.

## 4. External data sources

| Source | Endpoint / location | Used for | Access risk |
|---|---|---|---|
| pobb.in | `GET /<id>/raw` | fetch PoB export code | low; also accept raw paste |
| PoB code | base64url → zlib inflate → XML (`<PathOfBuilding>` / `<PathOfBuilding2>`) | items, mods | low |
| Trade stats | `GET /api/trade/data/stats` (incl. `pseudo.*`) | mod text → stat IDs | low |
| Trade search | `POST /api/trade(2)/search/{league}` → `{id}` | build link `…/trade(2)/search/{league}/{id}` | Cloudflare/rate limit |
| Trade fetch | `GET /api/trade(2)/fetch/{ids}?query={id}` (≤10) | live prices | rate limit + POESESSID |
| Mod tiers | RePoE-style dataset (PoE2 equiv. later) | tier bands / same-tier matching | medium; may be absent |
| Base tiers | `NeverSinkDev/FilterBlade-Public-Assets` + `NeverSink-Filter` JSON | base-type tiering, base broadening | medium; no official API, per-league drift |
| Corruption/implicit data | RePoE / game data | corrupted-implicit suggestions for uniques | medium |

## 5. Matching Strategy Engine

Each parsed mod flows through a strategy that decides how loose to be, emitting **typed trade
stat groups**:

| Group type | Meaning | Default use |
|---|---|---|
| `and` | all filters must match | the few defining mods |
| `count` | at least N of these match (tunable) | "any 2 of fire/cold/lightning res" |
| `weight` | weighted sum ≥ min | overall "good enough" similarity |
| `if` / `not` | conditional / exclude | edge cases |

**Pseudo stats** (`pseudo.pseudo_total_*`) collapse equivalent mods (e.g. total resistances,
total life, attributes) so items matching *however they roll* qualify.

**Strictness presets** (then fine-tune): `Exact` · `Similar` (default) · `Loose`.

**Per-mod / per-group controls:** include/exclude · min/max · move to count or weight group ·
choose "any N of" · pseudo vs explicit · range-band % (how far below current roll to allow).

Link regenerates live as the client tweaks.

## 6. Tiers & bands

- **Mod tier band:** default min = banded value (e.g. % of current roll or tier floor), no max.
- **Base-type tier:** shown per item; optional "search same item class at this base tier or
  better" broadening; high-tier bases highlighted/prioritized.

## 7. Budget Axis & item variants  *(per-item)*

Every item can be generated at multiple points on a budget axis. The client picks per item
(and can apply a build-wide default):

| Mode | Intent | Behavior |
|---|---|---|
| **Min-max** | best possible version (expensive) | max out rollable mods; require desirable corrupted implicits / double-corrupts; top tier base; tightest filters |
| **As-is** (default) | match the build's actual item | similar/fuzzy filters from the real rolls |
| **Budget** | cheapest acceptable (save money) | relax/zero mod mins; uncorrupted; allow lower base tier; minimal defining mods only |

- **Suggest cheaper alternatives:** when price fetch is enabled, recommend the cheapest version
  that still meets a client-set threshold (e.g. "within 10% of the build's stats for X% of the cost").

### 7a. Unique items (special handling)

Uniques cannot be searched by name alone — value depends on rolls, variants, and corruptions.

- **Variable mod rolls:** a unique's rollable explicit mods map to stat IDs; emit as min/max
  filters. Min-max = high rolls; Budget = relaxed/ignored.
- **Variants:** some uniques have multiple variants (legacy vs current, alternate versions,
  selectable mods like Watcher's Eye / Impresence / Combat Focus). Detect and let the client
  pick the variant; map variant-specific mods to the correct stat IDs.
- **Corruption / double-corrupt:** corrupted implicits (Vaal implicits) can multiply value.
  - Min-max: require specific desirable corrupted implicits (`corrupted = true`).
  - As-is: match the build item's corruption state.
  - Budget: `corrupted = false` (or any), drop corruption requirements to lower price.
- **Corruption data source:** RePoE / game data for possible corrupted-implicit outcomes per item.

## 8. Item category rules (detailed)

Each category maps the build item to a trade query. "Min-max / As-is / Budget" refer to the
§7 budget axis. Trade query group names below reference the PoE1 `query` object
(`filters.type_filters`, `.weapon_filters`, `.armour_filters`, `.socket_filters`,
`.req_filters`, `.misc_filters`, `.trade_filters`, plus the `stats` groups from §5).

### 8.1 Rares (weapons, armour, jewellery)  — primary case
- Rarity = Rare; set `type` to the **base type** (e.g. *Vaal Regalia*). Base broadening (§6) can
  swap exact base → "same class at this base tier or better".
- Mods → stat groups per §5. Default **Similar**: defining mods `and` (banded min), resistances
  → `count`/pseudo, life/ES/attributes → pseudo-total, filler → `weight` or dropped.
- **ilvl** (`misc_filters.ilvl`): only constrain when a desired mod tier requires it (min-max).
- **Quality** on gear (`armour/weapon quality`): ignore by default; min-max may want 20%+.
- Distinguish **local vs global** mods (e.g. local "+phys to this weapon" vs global) — local
  mods feed computed DPS/defence filters (§9), not generic stat filters.

### 8.2 Weapons — computed DPS searching
- Offer DPS-based search as an **alternative/supplement** to mod-by-mod (often how min-max
  weapons are priced): `weapon_filters` → `dps`, `pdps`, `edps`, `aps`, `crit`.
- Min-max: set `pdps`/`edps`/`dps` min from the build's weapon (banded). Budget: lower the floor.
- Still attach key explicit mods (e.g. +levels of gems, crit multi) as `and`/`weight`.

### 8.3 Armour — computed defences
- `armour_filters` → `armour`, `evasion`, `energy_shield`, `block`, `ward`, `total defences`.
- Min-max: search by total defence (banded). Budget: relax.

### 8.4 Sockets / links / colours
- **PoE1** (`socket_filters`): `links` (min/max for largest linked group), `sockets`
  (count + colour requirement R/G/B/W/A, incl. abyssal/white).
  - Min-max: required links (e.g. 6L) + colours.
  - **Budget default:** ignore links/colours — assume the buyer links/chromes themselves
    (cheaper). Toggle to enforce when relevant (e.g. 6L on expensive uniques).
- **PoE2**: no gem links; gear has **rune sockets**. Search by rune-socket count; runes are
  separate items. Handle under PoE2 enablement.

### 8.5 Influenced / synthesised / fractured / eldritch bases  (PoE1)
- `misc_filters` flags: `shaper_item`, `elder_item`, `crusader_item`, `redeemer_item`,
  `hunter_item`, `warlord_item`, `synthesised_item`, `fractured_item`.
- Eldritch (Searing Exarch / Eater of Worlds) implicits → `implicit.stat_*`, optionally tiered.
- **Veiled** mods → `misc_filters.veiled`; **crafted** → mods flagged crafted; **fractured**
  mods are explicit-but-locked → still map as explicit stats.
- Rule: influence/synth is usually a *means to a mod*. Default = search the **mod**, not the
  influence flag (broader, cheaper). Min-max may pin the influence; budget never does.

### 8.6 Jewels (regular & abyss)
- Type filter (jewel base / abyss jewel). Jewels roll 2–4 mods from a pool → ideal for
  **`count`/`weight`** groups ("any item with these 2–3 good mods"), rarely `and`-all.
- Abyss jewels: base + mods; note they also need an abyssal socket on gear (informational).
- Min-max: more required mods + higher mins. Budget: 1–2 key mods via `count`.

### 8.7 Cluster jewels  (PoE1)
- Value = the **enchant** mods granting notables (`enchant.stat_*` "Added Passive Skill is X")
  plus the "Adds N Passive Skills" / "1 Added Passive ... grant" implicit.
- Search by the desired **notables** as a `count` group (e.g. "has any 2 of these notables").
- Constrain base (Large/Medium/Small), `ilvl` (50/68/75 passive-count tiers), and total added
  passives. Min-max: exact notables + ilvl + low passive count (efficient). Budget: notables only.

### 8.8 Flasks
- **PoE1**: utility/life/mana flasks; search base + prefix/suffix explicit mods via `count`
  (e.g. "of Staunching", "Experimenter's"). Quality optional. Instilling enchant → `enchant.stat_*`.
  Uniques handled per §7a.
- **PoE2**: life/mana flasks differ; charms are separate items. Handle in PoE2 phase.

### 8.9 Gems (skill & support)
- `type` = gem name; `misc_filters` → `gem_level`, `gem_level_progress`, `quality`,
  `corrupted`, `gem_alternate_quality` / transfigured variant where applicable.
- Min-max: level 21 (corrupted) + quality 23, or 20/20 baseline. Budget: 20/0 or 1/20.
- Special: Awakened supports (level matters most), Empower/Enlighten/Enhance (level-gated),
  Vaal gems (separate type), transfigured gems (distinct names).

### 8.10 Amulets / rings — anointments & special implicits
- **Anointments** (oils) → `enchant.stat_*`; match the anoint as a toggleable filter.
- Watcher's Eye–style aura-conditional uniques → variant + `count` of aura mods (§7a).

### 8.11 Helmet/gear enchantments (PoE1 lab)
- Lab enchant → `enchant.stat_*`; optional, off by default (often cheap to self-enchant).

## 9. Cross-cutting trade mechanics

### 9.1 Pseudo aggregations to prefer (when present)
- `pseudo_total_life`, `_energy_shield`, `_mana`
- per-element resistance, `_total_elemental_resistance`, `_total_resistance` (incl. chaos)
- per-attribute, `_total_attributes`
- added/increased damage pseudos for weapons & spells
Prefer pseudo-totals for life/ES/res/attributes so items qualify *however they roll*.

### 9.2 `misc_filters` toggles surfaced as options
`corrupted`, `mirrored`, `split`, `identified`, `crafted`, `veiled`, `enchanted`,
`alternate_art`, `ilvl`, `gem_level`, `quality`. All default to "any" unless the budget mode
or a rule says otherwise.

### 9.3 Number / mod-text handling
- Normalize numeric rolls to `#` templates for stat matching; carry the actual values.
- Two-value mods ("Adds X to Y Damage") → trade two-value filter; default min on the lower/avg.
- Sign handling: `increased`/`reduced`, negative implicits, `+`/`-`.
- Hybrid mod lines that map to multiple stats → emit each stat.
- Ranges from the build (PoB gives current roll) → band per strictness (§5/§6).

### 9.4 Search / league / price config  (`filters.trade_filters` + status)
- **League**: from `data/leagues`; default current challenge softcore; client-selectable
  (Standard / Hardcore / current league). SSF excluded (not tradeable).
- **Status**: `online` by default (option: any / online-in-league).
- **Price**: optional min/max + currency; `sale_type` buyout-only option; exclude AFK/offline.
- **Sort**: price ascending by default.

## 10. Implementation phases (high level)

1. Build import & decode (pobb.in/raw → XML → item text blocks)
2. Item text → structured mods (normalize rolls to `#` templates, classify type, local/global)
3. Stat DB + classification + pseudo mapping + tier/base-tier data
4. Matching Strategy Engine + query builder (and/count/weight/pseudo + weapon/armour/socket/misc) → links
5. Budget axis generators (min-max / as-is / budget) incl. unique & per-category handling (§8)
6. Optional live price fetch (rate-limited, on-demand) + cheaper-alternative suggestions
7. UI / build view (PoE dark editorial, rarity + base-tier color semantics)
8. PoE 2 enablement (`/api/trade2`, PoE2 stats/tiers/bases, rune sockets, no links)

## 11. Key risks

| Risk | Severity | Mitigation |
|---|---|---|
| Cloudflare blocks server requests | HIGH | realistic UA + optional POESESSID; respect Retry-After; degrade to links-only |
| Mod text → stat ID mismatch | HIGH | `#` templating + fuzzy fallback; surface unmatched mods, never drop silently |
| Over-constrained → 0 results | MEDIUM | fuzzy defaults (count/weight/pseudo + bands) |
| Local vs global / hybrid mod misclassification | MEDIUM | use mod metadata; route local mods to computed DPS/defence filters |
| Mod tier data absent | MEDIUM | RePoE dataset; fall back to % bands |
| Base-tier data (no official API, league drift) | MEDIUM | source from NeverSink GitHub JSON; cache + refresh; degrade gracefully |
| Rate limiting on price fetch | MEDIUM | server-side shared queue + backoff; on-demand per item |
| Unique variant/corruption complexity | MEDIUM | per-category data (RePoE); start with common uniques, expand |
| Cluster jewel / gem variant naming | LOW | map via `data/items` + RePoE; toggleable |

## 12. Open questions / TBD

- Package manager + styling choice (Tailwind + tokens recommended).
- "Budget threshold" UX (how the user expresses "within X% of stats / Y% of cost").
- Whether to persist imported builds (DB) or keep stateless.
- Per-category override defaults (e.g. always-ignore-links toggle).
- PoE2-specific divergences to detail when we reach phase 8 (charms, runes, spirit, no links).

## 13. Improvement backlog (user-requested, prioritised)

Captured 2026-06-11 from real-use feedback. Roughly ordered by impact on "actually
getting results" when pricing a full rare.

**P0 — searches over-constrained → 0 results (the core problem) — DONE 2026-06-11**
- Fixed: modes no longer AND every mod at exact rolls. asis = count group "any
  ceil(60%) of mods" at 70% bands; budget = "any 40%" at 50%; minmax = all/100%.
  Verified on a 13-mod PoE2 quarterstaff → "any 6 of 9".

**DONE 2026-06-11 — per-mod controls + and/count/not groups (user-requested)**
- Each item has a "Customize" panel: per-mod group selector (Must=and / Any=count /
  Excl=not / Off), editable min & max, and an "any N of M" count control. Link
  rebuilds live (debounced) from the user's choices. Server `buildItemQuery` takes
  EditableFilter[] overrides; verified and/count/not assembly. `weight` group still TODO.

**P0 — pseudo variants for attributes & resistances (user emphasised)**
- Per attribute mod, offer selectable variants: `+# total to all Attributes`,
  `total Strength`, `total Dexterity`, `total Intelligence`, and combined ones
  (e.g. "to Dexterity and Intelligence" → contributes to each total + all-attr).
- Per resistance mod, offer: per-element total, `total Elemental Resistance`,
  `total Resistance` (incl. chaos) — in addition to the count group.
- These pseudo aggregates exist in `data/stats` (`pseudo.*`); let the user pick which
  variant a mod is searched as. Hybrid/combined mods must feed every total they affect.

**P1 — per-mod controls: include/exclude + prefix/suffix split**
- Split an item's mods into **Prefixes** and **Suffixes** in the UI so the user can
  see and adjust which to keep (helps decide build trade-offs). Needs affix-type data
  (PoB "Prefix:/Suffix:" lines when present; else infer from mod metadata/tiers).
- Each mod gets include/exclude + editable min/max so the user tunes before searching.

**P1 — drop / flag uncheckable mods by default**
- Some mods are effectively unsearchable or unhelpful for pricing (e.g. enchant
  "#% increased Explicit Defence/Resistance Modifier magnitudes", niche enchants).
  Exclude these from the default AND set; keep them toggleable, not forced.

**P1 — instant buy-out search**
- Add `trade_filters.filters.sale_type = { option: "priced" }` (buyout/fixed price)
  and price min/max + currency. Default to buyout-only so results are instantly buyable.

**P1 — search by weapon / armour computed filters**
- Weapons: `weapon_filters` → `dps`, `pdps`, `edps`, `aps`, `crit` (banded from the
  build's weapon) as an alternative/supplement to mod-by-mod.
- Armour: `armour_filters` → `armour`, `evasion`, `energy_shield`, `block`, `ward`.
- Surface as optional toggles on the relevant item cards.

**Carry-over (from earlier phases)**
- Mod tier bands (RePoE) for true "same tier" instead of % bands.
- Base-type tiering (FilterBlade) + base broadening.
- Budget-axis UI incl. unique variant/corruption selection.
- On-demand live price fetch (rate-limited, POESESSID) + cheaper-alternative suggestions.
