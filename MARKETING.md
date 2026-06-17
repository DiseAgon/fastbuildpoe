# Growth playbook

The product is built and shareable. Growth = right tool + right moment + right channels.

## #1 lever: timing
Push hard **at a PoE / PoE2 league launch or major patch** — that's when the whole
community is online theorycrafting and pricing gear. A tool post lands far better
then than mid-league.

## Built-in viral loops (already shipped)
- **Share link** + **Export to pobb.in** carry `fastbuildpoe.xyz` (and a notes credit) —
  every shared priced build advertises the site.
- **OG/social preview image** so links look legit when pasted (Reddit/Discord/Twitter).
- **Footer brand link**.

## Channels (in priority order)
1. **Reddit** — r/pathofexile, r/PathOfExileBuilds, r/PathOfExile2. Post a short GIF
   (paste pobb link → instant trade links + total). Flair "Tool". Read each sub's
   self-promo rules. Reply to every comment for the first few hours.
2. **Build-guide creators** (highest ROI) — DM 5–10 YouTubers/streamers who publish
   pobb.in builds. Export-to-pob + one-click pricing saves them work; one feature = a spike.
3. **PoE Discords** — official + popular build/economy servers (#tools channels).
4. **Official PoE forum** — Community Showcase.
5. **Tool lists / wiki** — awesome-poe lists, subreddit wiki, poe.ninja tool links.

## Reddit post template
> **Title:** I built a tool that price-checks your ENTIRE PoE build from a pobb.in link [Tool]
>
> Paste a pobb.in link (or PoB code) and it lists every item with a ready-made
> trade-search link — tuned to find *similar* items, not exact copies (count/pseudo
> groups, weapon DPS, instant buy-out). Note prices per item, get group + grand totals
> in Divine, and export back to PoB or pobb.in with the prices in the notes.
>
> Works for PoE 1 and PoE 2. Free, no login. → https://fastbuildpoe.xyz
>
> Feedback very welcome — there's a button in the footer. (GIF below.)

## Creator DM template
> Hey [name] — love your build guides. I made a free tool that turns a pobb.in link
> into a trade-search link for every item (PoE1 & 2), with budget/min-max modes and a
> price-total + export-back-to-PoB. Might save you time pricing your guides — and it
> credits the source pobb when shared. Would love your thoughts: https://fastbuildpoe.xyz

## Before posting — checklist
- [ ] Record a ~15s GIF of the core flow (paste link → links → totals → export).
- [ ] Confirm the OG preview renders (paste the link in Discord/Twitter to check the card).
- [ ] Enable Vercel Web Analytics (Dashboard → Analytics) to measure the spike.
- [ ] Set `FEEDBACK_WEBHOOK_URL` so feedback from the wave actually reaches you.
- [ ] Re-run `npm run snapshot` so leagues/stats are current for launch day.
