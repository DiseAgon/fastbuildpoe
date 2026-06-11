# "Sign in with Path of Exile" — OAuth setup

To import a character directly (no pobb.in), the app uses GGG's OAuth. **GGG must
register and approve an OAuth client for you** — there's no instant self-service,
so start this early (approval can take days).

## What you do (one-time)

1. Read the official docs: https://www.pathofexile.com/developer/docs/authorization
2. Request an OAuth client from GGG (per the docs — currently via contacting GGG
   / the developer program). Provide:
   - **Application name**: FastBuildPOE
   - **Type**: Confidential client (web app with a backend) — you'll get a
     `client_id` **and** `client_secret`.
   - **Redirect URI**: `https://fastbuildpoe.vercel.app/api/auth/poe/callback`
     (and `http://localhost:3000/api/auth/poe/callback` for local dev)
   - **Scopes**: `account:characters` (read characters + items). Optionally
     `account:profile` (display the account name).
3. When approved, you'll have `client_id` + `client_secret`.

## What you give me / set in the deploy

Set these as environment variables (Vercel → Project → Settings → Environment
Variables, and `.env.local` for dev). **Never commit the secret.**

```
POE_OAUTH_CLIENT_ID=...
POE_OAUTH_CLIENT_SECRET=...
POE_OAUTH_REDIRECT_URI=https://fastbuildpoe.vercel.app/api/auth/poe/callback
SESSION_SECRET=...            # random string for signing the session cookie
```

## What I build (once the client exists)

- `Sign in with Path of Exile` button → OAuth authorize redirect (PKCE + state).
- `/api/auth/poe/callback` → exchanges the code for a token, stores it in a
  signed, httpOnly session cookie.
- `/api/build/character` → lists your characters, fetches the chosen one's items
  from `api.pathofexile.com`, and parses them into the same item model used for
  pobb.in imports (parser is already built — see `parseCharacterItems.ts`).
- Character picker in the UI alongside the pobb.in box.

Notes:
- `api.pathofexile.com` is the token-based developer API (not the Cloudflare-
  walled trade site), so it should work from Vercel.
- The character API gives gear + socketed gems; tree jewels come from the passive
  API (later). pobb.in import stays available either way.
