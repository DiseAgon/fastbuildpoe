# Deploying FastBuildPOE (Vercel)

The app is deploy-ready: PoE stats/leagues/divine-icon are **bundled snapshots**
(`src/data/poe/`), so it works on a cloud host even though pathofexile.com's
Cloudflare blocks datacenter IPs. Weapon bases (GitHub) and pobb.in are fetched
live and aren't blocked.

## Fastest: Vercel CLI (no GitHub needed)

From the project folder, in your own terminal:

```bash
npx vercel            # first run: log in (browser), accept Next.js defaults → preview URL
npx vercel --prod     # promote to a stable production URL to share
```

- It auto-detects Next.js — accept the defaults (build `next build`, output handled).
- No environment variables are required to run. Optional ones (`.env.example`):
  - `APP_USER_AGENT` — polite UA for the live league refresh / weapon-base fetch.
  - `POESESSID` — only needed later for live price fetch (not used yet).

## Alternative: GitHub + Vercel dashboard

```bash
gh repo create FastBuildPOE --private --source=. --push   # or create the repo in the GitHub UI and push
```

Then on vercel.com → **New Project** → import the repo → Deploy. Pushes auto-deploy.

## After a new league

Refresh the bundled data from a machine that can reach the PoE API, then redeploy:

```bash
npm run snapshot      # updates src/data/poe/*.json
git commit -am "chore: snapshot <league>"
npx vercel --prod     # or push if using GitHub integration
```

Testers can also type the current/event league directly in the league box, so a
stale snapshot never fully blocks them. See DATA_SOURCES.md for details.

## Known checks once live

- Generated **PoE2** searches: confirm `equipment_filters` (ES / DPS) actually
  populate on the trade2 site. If not, fix the field/group names (see DATA_SOURCES.md).
- Live price fetch is not implemented yet — pricing is manual (per-item boxes).
