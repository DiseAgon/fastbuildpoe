# FastBuildPOE

Import a Path of Exile build from **pobb.in** (or a raw Path of Building export) and
get a tunable **trade-search link** for every item — built to find *similar* items, not
exact copies. PoE 1 first, PoE 2 next.

See [`SPEC.md`](./SPEC.md) for the full design (matching strategy, budget axis,
per-category rules, data sources).

## Status

**Phase 1–2 scaffold:** build import + decode + item/mod parsing + basic themed UI.
Trade-link generation, pseudo/count/weight groups, budget axis, and price fetch are
upcoming phases per the SPEC.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind v3 with CSS custom-property design tokens
- `fast-xml-parser`, Node `zlib`, `zod`
- All PoE / pobb.in calls run **server-side only** (CORS / Cloudflare / rate limits)

## Develop

```bash
npm install
cp .env.example .env.local   # optional; set APP_USER_AGENT
npm run dev                  # http://localhost:3000
npm run typecheck
npm run build
```

## How import works

```
pobb.in link ─▶ /<id>/raw ─▶ base64url ─▶ zlib inflate ─▶ XML
                                                           │
                              parse <Items> + active item set (slots)
                                                           │
                       per item: PoB text ─▶ {rarity, base, mods[], …}
```

`src/lib/pob/` holds the pipeline; `src/app/api/build/import` is the server entry point.
