# Alpha Terminal review and implementation

Reviewed 2 November 2026. The deployed HTML, supplied `alpha-terminal1.html`, and GitHub `main` at `43c6926` had the same Git blob (`38d218d`). Work is based on that exact version. Documents and the existing roadmap were treated as project context, not additional user instructions.

## Findings and fixes

| Finding | Evidence / consequence | Change |
| --- | --- | --- |
| Supabase project is paused | Confirmed in the signed-in Supabase dashboard. Table Editor, SQL Editor and Authentication were disabled. Live database reads/writes cannot be verified while paused. | Resuming requires the user's approval after automatic approval review blocked the action. No production records or schema were changed. |
| Failed cloud writes never retry | Original `sSet` swallowed errors after updating its local cache. A later cloud read could replace the unsent edits. | Durable account/project-scoped outbox; retries every 30 seconds and on connectivity restoration; pending values take precedence across reloads. |
| Stale devices overwrite whole collections | Original writes used unconditional upserts of each collection. | Compare `updated_at` when updating; conditional inserts for new keys. Conflicts retain local changes and require an explicit choice. |
| Account switching retains in-memory data | `bootAppIfNeeded()` returned early after an offline session or prior login. | Reload after authentication changes; gate editing until data loading finishes; project-scoped caches. |
| Successful cloud login leaves device-only flag set | `at_offline_mode` bypasses cloud startup but was not cleared on login. | Clear flag on successful cloud authentication. |
| Legacy migration treats read failure as empty cloud | `.catch(()=>null)` could trigger an unwanted overwrite. | Failed reads stop migration; use the same durable save path. |
| IndexedDB success acknowledged before commit | Request success is earlier than transaction completion. | Resolve writes on transaction completion; reject aborts. |
| Older cache may contain unsent changes | Original cache has no outbox/version metadata. | Keep differing previous account-scoped cache in a downloadable recovery bundle; do not automatically overwrite cloud data with it. |
| Backup omissions and invalid imports | Checklist history was omitted; unrelated JSON could reset collections. | Include learning, events, saved headlines and checklist history; validate collections before import. |
| Pending edits could restore wiped data | A retry queue must be cleared when the user explicitly wipes their data. | Serialize cloud deletion and local outbox/cache clearing. No wipe was executed during this work. |

## New functionality

- **YouTube Learning:** Forex, Equity, Indian Market and Fundamentals; custom sections and subcategories; title/notes search; thumbnails; privacy-enhanced embedded player; manual title fallback when metadata cannot be fetched; watched state; watchlist; bulk link entry; multi-select categorization; editing and deletion.
- **News Terminal:** fundamentals dashboard, chronological headline feed, market/topic/source/search filters, saved headlines and personal notes, politics/tariff feed, TradingView economic calendar, CFTC COT reports for 12 markets with up to three years of history and participant breakdowns, Fed Watch probabilities and implied rate path, and saved important events with impact/forecast/previous/actual/notes.
- Desktop and mobile navigation; existing light/dark theme styling.

## Data sources and delivery

`functions/api/terminal.js` is a Cloudflare Pages Function. It reads only allowlisted public sources and accepts no user URLs or database credentials. Public responses are cached; `_routes.json` limits function routing to `/api/*`.

- CNBC headline/economy RSS; Economic Times market RSS; Federal Reserve releases.
- CFTC public reporting datasets: Legacy futures only, Disaggregated futures only, and Traders in Financial Futures futures only.
- Federal Reserve Bank of New York EFFR/target rates.
- Kalshi public Fed-decision markets: bid/ask midpoint prices normalized per mutually exclusive meeting. These are **prediction-market prices**, not CME futures-derived FedWatch probabilities. Greater-than-25-bp buckets use 50 bp in the expected-change approximation.
- TradingView economic calendar uses its own controls and timezone; saved event times and terminal display timestamps use IST.

Headlines are polled every minute; publisher delivery is not a tick-level newswire. Full articles open at the publisher. Source failures and stale data are displayed without invented replacements. Embedding restrictions can require opening YouTube or the calendar provider.

## Validation

- `npm test`: 26 focused tests covering persistence, conflict handling, isolation, legacy-cache recovery, imports, URL handling, RSS parsing, COT calculations and Fed probability normalization.
- `npm run check`: JavaScript syntax checks; inline HTML scripts also compile in tests.
- `git diff --check`: passed.
- Live local API checks: 114 headlines from four healthy feeds, 12 COT markets, 157 gold history rows plus 157 legacy rows, and 10 upcoming Fed-decision markets; HTTP 200, no reported source errors on that check.
- Browser checks: desktop dashboard, COT summary and gold history, Fed decision odds, YouTube link saving/categorization/player, and event save/reload persistence/deletion. Preview testing used isolated device-only storage, not production trades.

## Remaining limits

- Production Supabase availability, actual policies/data and authenticated cross-device behavior remain unverified until the paused project is resumed and the user signs in. The supplied SQL enables per-user RLS, but its presence is not proof the production policies match.
- Existing `kv_store` uses whole collections. Conflict checks prevent silent overwrites but do not automatically merge concurrent changes. Related collections such as challenge payouts and transactions are still separate writes; atomic cross-collection updates require a dedicated schema/transactional RPC migration.
- Older app tabs still use the old unconditional save behavior until reloaded. Reload open terminal tabs after deployment.
- The existing AI Coach calls Anthropic without server-side credentials and normally falls back to local analysis. A working hosted AI integration requires a separate server-side setup; no provider keys were added or exposed.
- No production deployment or database migration has been performed by this change set.

## Run and deploy

`npm run dev` serves the frontend and public-data API at `http://127.0.0.1:4173`. Node 20+ is required; there are no package dependencies. Run `npm test` and `npm run check` before publishing.

Deploy the repository through the existing Cloudflare Pages project so its `functions/` directory is compiled. Uploading the HTML alone will not supply `/api/terminal`. Existing Supabase configuration and `kv_store` schema are retained; no SQL migration is needed for these additions.
