# AGENTS.md

DukaanGo (aka LocalCart / Smart Kirana): voice-powered kirana store management. Vanilla JS frontend + Flask/SQLite backend. No build step, no npm, no tests.

## Working agreement

**Before changing code:**
- Inspect the relevant files and understand the existing architecture first.
- Search the repo for existing implementations before creating new ones.
- Follow existing patterns, naming conventions, dependencies, and folder structure.
- Do not rewrite working code or duplicate utilities/components/services unless necessary.

**When implementing:**
- Write production-quality code, not demo code. Keep changes focused and minimal.
- Handle edge cases and errors; preserve existing functionality.
- Prefer simple, maintainable solutions over clever ones.
- Do not add dependencies unless genuinely necessary.
- Never hardcode secrets, API keys, credentials, or environment-specific values.
- Reuse existing components and utilities whenever possible.

**Frontend specifics:**
- Follow the existing design system; reuse existing UI components; make layouts responsive.
- Handle loading, empty, error, and success states.
- Do not generate unnecessary UI or components.

**After implementing:**
- Review every changed file; run relevant tests, type checks, linting, and build commands; fix errors you introduced; check for regressions.
- Do not claim something works unless you actually verified it.

**Debugging:**
- Find the root cause before changing code; explain the cause briefly; make the smallest correct fix; verify it rather than assuming it works.

**Ambiguity:**
- Inspect the codebase for context first, make the most reasonable assumption and state it briefly. Only ask the user when ambiguity would materially change the implementation.

## Running the app

- Backend deps: `pip3 install -r backend/requirements.txt` (pins exact versions; installing may downgrade globally-installed `requests`).
- Start both servers: `python3 launch_web.py [--no-open]` — serves `frontend/` static on `127.0.0.1:5501` and Flask on `127.0.0.1:5005`. Prefers a repo-root `.venv` if present (see `launch_web.py` `resolve_backend_python`).
- Backend is autoreloaded (Flask debug mode) — `debug=True` spawns a reloader, so `run.py` runs in a subprocess.
- `dashboard.html` is legacy and **not referenced anywhere** — do not edit it. The real dashboards are `frontend/owner.html` and `frontend/admin.html`.

## Data architecture (two parallel layers)

- **Client side (source of truth for billing/voice)**: `frontend/js/data-engine.js` (IIFE `DataEngine`) persists to `localStorage` under `lc_*` keys (inventory, transactions, priceMemory, unavailableLog). Voice billing reads/writes this, not the backend.
- **Server side**: SQLite DB auto-created at `backend/localcart.db` via `init_db()` (in `backend/database.py`, called from `run.py`). Schema is created only (`CREATE TABLE IF NOT EXISTS`) — no migration tooling; changing schema requires deleting the `.db` or writing migration code.
- `DataEngine` syncs with backend on load and after each completed bill; falls back to local-only when backend unreachable.

## Backend notes (`backend/run.py`)

- Only `/customer/me`, `/customer/order`, `/customer/orders` require JWT. Inventory/transactions endpoints are unauthenticated.
- CORS origins are **hardcoded** — if you change dev port 5501/5005, update the list or requests will be blocked.
- Sarvam AI proxies (`/api/sarvam/asr|tts|chat`, `/api/analytics/chat`) need `SARVAM_API_KEY`; otherwise they return 501 and `/health` reports `"sarvam": false`. Voice billing still works client-side without it.
- `/login` is a mock returning `lc_mock_token_12345`; role is set **client-side** only. Admin access is not enforced server-side.
- Auth token keys: `lc_auth_token` and `lc_auth_user` in sessionStorage or localStorage. Each dashboard page defines its own `window.apiCall` helper wrapping the token.

## Frontend structure

- Entry points: `frontend/index.html` (landing with 3 portals) → `login.html` (role selector) → `owner.html` or `admin.html`. Customer goes directly to `customer/index.html`.
- Dashboard sections are built in three places:
  - Sections 1–8: inline HTML in `owner.html` / `admin.html`
  - Sections 9–15: injected by `frontend/js/sections2.js`
  - Sections 16–21: injected by `frontend/js/voice-sections.js`
  - Both injectors REQUIRE `#sections2Container` to exist in the HTML.
- To add a section you must update: `sectionTitles` in `js/app.js` (for nav/titles/switchSection), the sidebar + mobile drawer links in both `owner.html` and `admin.html`, and the section content.
- Script load order in `owner.html`/`admin.html` matters: `data-engine.js` → `voice-engine.js` → `app.js` → `sections2.js` → `voice-sections.js` → `buttons.js` → `filters.js`. `voice-sections.js` references `DataEngine` in template literals at load time.

## Verification

- No tests, lint, or CI exist. Verify by: `curl http://127.0.0.1:5501/<page>` returns HTML and `curl http://127.0.0.1:5005/health` returns `ok`.
- PWA service worker (`frontend/sw.js`) is network-first, and the dev server sends `Cache-Control: no-store`, so changed files are picked up in dev.

## Voice / multilingual

- STT/NLU/TTS lives in `frontend/js/voice-engine.js` (~1900 lines). Browser `SpeechRecognition` (Chrome/Edge only; EN/TE/HI). Item matching uses an alias map + Levenshtein + Telugu `nameTE` from inventory.