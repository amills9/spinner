# Word Spinner

A daily writing-prompt spinner: up to 3 spins to land on a word + a NAPLAN-aligned
writing style, lock in whichever reel you're happy with and respin the other, then
lock in the day's challenge — either explicitly or automatically once spins run out.

## Rules implemented

- **3 spins per day.** Each spin re-rolls whichever reel(s) aren't locked. Lock the
  word (or style) to keep it fixed while respinning the other. Once you're happy,
  tap "Locked in? Tap to finish" to end the day early — or just use all 3 spins and
  it finalizes automatically.
- **Words** — "once through" pool. A word only counts against that pool once the day
  is actually finalized (locked in or 3 spins used) — words seen during respins that
  didn't end up chosen aren't wasted. Once the whole pool has been drawn, it unlocks
  and a new cycle starts. Add words one at a time or bulk-import a CSV/text list
  from `/admin`.
- **Styles** — narrative, informative, recount, persuasive, descriptive, imaginative.
  A style can't repeat the very next day, and can't be used more than twice in any
  trailing 7-day window — counted from finalized days only. If those rules ever leave
  zero options (rare, only with very few active styles), the weekly cap is relaxed
  first, keeping the 1-day cooldown intact.
- **Countdown timer.** Once finalized, the page shows "come back in X hours Y minutes"
  until local midnight, computed from the browser's own clock.

## Testing mode

Set `TESTING_MODE=true` in `.env` (and restart the backend) to let a finalized day
start over immediately instead of showing the countdown — handy for testing the full
spin/lock/lock-in flow repeatedly without waiting for real days to pass. A pink
"testing mode" banner shows on the page as a reminder. Set it back to `false` before
real use.

## Bulk-importing words

From `/admin` → Words → "Bulk import", either upload a `.csv`/`.txt` file or paste a
list of words separated by commas or new lines, then import. Duplicate or
already-existing words are silently skipped; anything that isn't plain alphabetic
text is filtered out before import. Also available directly via the API:

```bash
curl -X POST http://localhost:3001/api/words/bulk \
  -H "Content-Type: application/json" \
  -d '{"words": ["battery", "volcano", "dragon"]}'
```

## Updating an existing (already-deployed) database

This version changes how a day's spin is stored — from one row written instantly, to
one row that gets updated across up to 3 spins and only counts once finalized. Run the
migration once on your existing database:

```bash
docker exec -i $(docker compose ps -q db) psql -U spinner -d word_spinner < migrations/002_multi_spin_sessions.sql
```

(If you're carrying over from before `TESTING_MODE` existed, run
`migrations/001_remove_difficulty_and_daily_unique.sql` first, in order.)

A fresh install picks all of this up automatically from `db/schema.sql` — no migration
needed.

## Local development

`docker-compose.yml` alone expects the `proxy-net` network to already exist (it does on
the VPS, created by your other projects) and doesn't expose any host port — that's correct
for production but won't run as-is on a laptop. Use the local override for that:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

`docker-compose.local.yml` exposes port 8090 on the host and makes `proxy-net`
non-external so Compose creates its own throwaway version of it locally — no need for
NPM or the shared VPS network.

- Frontend (kid-facing spinner + admin at `/admin`): http://localhost:8090
- Backend API directly: http://localhost:3001/api (not exposed in this setup — add a
  `ports` entry under `spinner-backend` in `docker-compose.local.yml` if you want to hit
  it directly during development)

## Production deployment (matching your usual pattern)

The `spinner-frontend` service joins the shared `proxy-net` network (the same one your
other CyanVector projects' containers use) as an `external` network, so nothing needs to
be exposed on the host — Nginx Proxy Manager talks to the container directly by name.
Run production with the plain compose file only — do **not** include
`docker-compose.local.yml` here, or it'll re-expose port 8090 and disconnect from the
real shared network.

1. Point a Cloudflare DNS record at your Linode VPS, e.g. `spinner.cyanvector.com`.
2. `docker compose up -d --build` on the VPS (requires `proxy-net` to already exist —
   it will, since your other projects created it).
3. Add a proxy host in Nginx Proxy Manager: `spinner.cyanvector.com` → forward to
   `spinner-frontend` (the container name) on port `80`, with SSL via
   Cloudflare/Let's Encrypt as usual.
4. Update `.env` with a real `PGPASSWORD` before first boot — don't ship the example value.
5. Make sure `TESTING_MODE=false` before this goes live for real daily use.

## API summary

| Method | Path                 | Purpose                                                   |
|--------|----------------------|--------------------------------------------------------------|
| GET    | /api/today           | Today's session state (spins used/remaining, word, style, locks, finalized) |
| POST   | /api/spin            | Use one spin — re-rolls whatever isn't locked                |
| PATCH  | /api/today/locks     | Toggle `wordLocked`/`styleLocked` for the current session     |
| POST   | /api/today/lock-in   | Finalize the day early, before all 3 spins are used           |
| GET    | /api/words           | List all words                                                |
| POST   | /api/words           | Add a word                                                    |
| POST   | /api/words/bulk      | Bulk import words: `{ words: [...] }`                         |
| PATCH  | /api/words/:id       | Edit text or active flag                                       |
| DELETE | /api/words/:id       | Delete (blocked if used in history — deactivate instead)       |
| GET    | /api/styles          | Same shape as words, for styles                                |
| GET    | /api/history         | Finalized days only: date/word/style/spins used, optional `?from=&to=` |

## Notes for future work

- The kid-facing design lives entirely in `frontend/src/pages/Spinner.jsx` and
  `frontend/src/styles/spinner.css`. Spin duration is controlled by the
  `WORD_SPIN_DURATION` / `STYLE_SPIN_DURATION` constants near the top of `Spinner.jsx`.
  The 3-spins-per-day cap is `MAX_SPINS_PER_DAY` in `backend/routes/spin.js`.
- If you ever want per-kid accounts instead of one household-wide daily session, the
  schema would need a `kid_id` on `spin_history`.
