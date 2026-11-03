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

## Fundamentals expansion — 2 November 2026

Renamed News Terminal to Fundamentals and expanded its dashboard to include DST-aware indicative FX session clocks, an embedded gold quote, next US CPI/NFP release, global economic calendar, FX heatmap, all-market COT positioning, and upcoming US releases alongside existing headlines and Fed odds. TradingView widgets retain source branding and fallback links; session clocks exclude holidays. This recreates the reference dashboard's functional layout using independent public sources, not its proprietary news/AI services.

Dedicated USA CPI and USA NFP monitors include 24 reference months of latest revised BLS data, charts, previous observations, release countdowns/schedules in IST, official source links, and related headlines. CPI monthly changes use SA indexes; annual changes use NSA indexes. NFP uses month-to-month payroll level changes in thousands, unemployment, and average hourly earnings. Missing observations are not treated as zero. BLS series are batched and cached hourly to reduce API usage; this is not a tick-by-tick economic release feed. Consensus estimates are available in the calendar widget and are not fabricated in BLS cards.

The BLS calendar endpoint denied automated retrieval locally. An explicitly labelled official schedule verified on 2026-11-02 provides a fallback through December 2027; no dates are extrapolated beyond that. A successfully retrieved live schedule takes precedence. Sources: https://www.bls.gov/schedule/news_release/cpi.htm and https://www.bls.gov/schedule/news_release/empsit.htm.

Validation: 31 tests pass; syntax and diff checks pass. Local batched API returned HTTP 200 for both CPI and NFP, 24 history rows each, no series errors. Browser verified latest data, dashboard widgets and mobile 390px layout without horizontal overflow. Production remains unchanged; paused Supabase verification is still pending explicit resume approval.

## Approved design integration — 3 November 2026

Applied the approved Lovable design's actual OKLCH tokens, IBM Plex Sans/Mono and Fraunces typography to the existing journal rather than replacing its working trade/account flows with prototype placeholders. Theme control now appears in the top header on desktop/mobile, saves selection locally and to the existing theme collection, and applies a local theme before paint. Brighter positive/negative semantic colours match the approved prototype.

Fed Watch now has a policy panel, all next-meeting outcomes with raw contract-price changes, full-width rate path with today's target band, New York meeting dates, and individual probability columns, likeliest outcome, implied rates and basis-point moves for every meeting. Missing prices remain unavailable. Added a DST-aware 24-hour session timeline and updating countdown hooks. Existing BLS CPI/NFP monitors and public feeds remain connected. Source screenshots guide information density; embedded TradingView calendar/quotes remain provider-rendered, so those panels are not exact visual copies. The feed does not provide licensed Trade Floor news or its consensus feed.

31 tests and syntax/diff checks pass. Local browser checked both themes and mobile 390px with no document overflow and visible header toggle. A transient Kalshi failure was displayed correctly; direct API retry returned 10 meetings and no errors. Supabase remains paused, so live authenticated cross-device writes remain unverified.

## Native economic calendar — 3 November 2026

Replaced the standalone TradingView view with a native date-grouped calendar: period navigation and presets, search, currency/impact filters, IST times, flags, impact indicators, actual/expected/previous columns, upcoming marker/countdown and expandable details. Source is the Forex Factory public weekly JSON export linked from its calendar. Server endpoint kind=calendar uses a 30-minute edge cache. Missing released actuals explicitly say Unavailable; future releases say Pending. A provider-widget toggle retains access to TradingView's actuals.

Material limitation: this free export supplies current-week schedule/forecast/previous and usually no actuals. Broader history/future ranges, event-history sparklines, full actuals and AI anticipation are not fabricated; full provider API integration is required to complete those capabilities. No API account, subscription or credentials were created. Browser verified search, USD filter, Today selection and mobile390px without document overflow. Normalization test covers offsets and missing actuals.

## Dashboard contrast and impact focus — 3 November 2026

Changed light mode to blue/white surfaces with dark navy readable text and blue navigation accents. Replaced the dashboard's pale embedded calendar and FX cross-rate matrix with native high-impact event lists and individual market tiles covering gold, silver, nine FX pairs, Bitcoin and Ether. TradingView's documented ticker-tag web component supplies real daily changes with explicit light/dark themes, CSS tokens, retained attribution and hover details. Tile layout adapts to available width to avoid truncation. Its baseline is the provider's daily session, not necessarily midnight UTC. Yahoo chart-feed probe returned429, so it was not adopted.

Next release now picks the earliest upcoming provider-rated High event across currencies, with deduplicated CPI/NFP schedule fallback. Medium/Low/Past events are excluded. Dashboard includes today's high-impact releases and other upcoming high-impact events. Separate macro/geopolitical news selection explicitly labels keyword selection because publisher RSS does not provide authoritative impact ratings.

Validation: 33 tests pass, including impact selection and CPI deduplication. Browser verified live market changes, light-blue/white and dark contrast, native release panels and source-labelled figures. Calendar source still has weekly-coverage/actuals limitations described above.

## Editorial redesign and live Nifty — 3 November 2026

Reworked the shell and news view toward the supplied reference: rounded floating sidebar/header, SVG navigation icons, blue selected states, sans-serif titles, larger featured-story card with publisher identity and original-source action, upcoming-release sidebar and softer layered cards. Page canvas remains white. Market tiles reduced from98px to52px; eight-tile heatmap has roughly half the former tile area.

Added kind=nifty public-data endpoint using Moneycontrol's public Nifty50 index feed, validated numeric price/change and provider epoch, cached60seconds. NSE endpoint failed and Yahoo returned429, so neither was adopted. Nifty now displays the index level, daily percentage and Moneycontrol timestamp; it remains a provider quote that can be delayed/unavailable. No sample prices are used.

Validation:34 tests pass, syntax/diff checks pass. Live local API returned23744.15, +1.2941%, timestamp13:41IST; browser confirmed it appears in the tile. Featured story uses real RSS headline/source with no fabricated article text or impact rating. Mobile390px has no horizontal document overflow.
