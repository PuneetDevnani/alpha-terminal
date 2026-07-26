# Alpha Terminal

A single-codebase trading journal and analytics platform — desktop, mobile, and (later) tablet from one HTML/CSS/JS app, one Supabase backend, and one deployment.

## Status

Track A (mobile stabilization) — **complete.** Current known bugs are fixed and mobile has been retested clean.

Track B (modularization & feature expansion) — **in progress**, see roadmap below.

## Architecture

- **Frontend:** HTML / CSS / JavaScript (single codebase, responsive layouts for desktop vs. mobile)
- **Hosting:** Cloudflare Pages
- **Database / Auth / Storage:** Supabase (Auth + Row-Level Security)
- **Version control:** GitHub
- **Future native app:** Capacitor (wraps the same web app — no rewrite)
- **AI:** OpenAI API

## Core Modules

- Trading Journal
- Analytics Dashboard
- Calendar
- Psychology Journal
- Mistake Tracker
- Strategy Library
- Accounts & Challenges
- AI Coach
- Settings

## Branching Model

- `main` — production, always deployable
- `develop` — integration branch for in-progress work
- `feature/*` — new functionality (e.g. `feature/mobile-ui`, `feature/analytics`, `feature/ai`)
- `bugfix/*` — one-off fixes, branched off `develop`

Work always flows `bugfix/*` / `feature/*` → `develop` → `main`. `main` is only updated by merging a tested `develop`.

## Development Workflow

1. Develop locally
2. Test desktop
3. Test mobile (iPhone)
4. Commit
5. Push to GitHub
6. Cloudflare auto-deploy
7. Test on device again post-deploy

## Roadmap (high level)

1. **Foundation** — modular CSS/JS, reusable components, separated desktop/mobile stylesheets
2. **Responsive design** — one codebase, sidebar+dashboard on desktop, bottom nav + single column on mobile
3. **Core modules** — see above
4. **Shared business logic** — one `saveTrade()` / `updateTrade()` / `deleteTrade()` used by both layouts
5. **Supabase** — migrate off `kv_store` to dedicated tables (trades, accounts, psychology, strategies, notes, screenshots) once features stabilize
6. **Desktop experience** — advanced analytics, multi-chart dashboard, trade replay
7. **Mobile experience** — trade cards, quick entry, camera uploads, swipe actions
8. **PWA** — manifest, icons, splash screen, offline support
9. **Native app** — Capacitor wrap, TestFlight → App Store
10. **AI** — trade review, psychology insights, personalized coaching
11. **Analytics** — win rate, expectancy, RR, drawdown, session performance, prop firm stats
12. **Monetization** — Free (journal + basic analytics) vs. Pro (AI Coach, advanced analytics, exports, cloud backup)

## License

See [LICENSE](./LICENSE). This is proprietary software — all rights reserved.
