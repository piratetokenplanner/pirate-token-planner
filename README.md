# Pirate Token Planner

Picks the best day to activate Fortnite **Pirate Shop Access** (14 days of free V-Bucks items), scored on the live Item Shop and your own taste. Static site, no build step, no dependencies.

## How it stays current
A GitHub Action (`.github/workflows/update.yml`) runs right after the 00:00 UTC shop reset and every 6 hours:

1. Reads the Item Shop and in-game news from fortnite-api.com.
2. Saves a daily snapshot in `data/history/`. These snapshots become the baseline for "a normal shop day".
3. Re-checks every token rule and expected event against its source pages (`mustContain` phrases) and marks each one announced, confirmed, reported, pattern or unverified.
4. Commits the data, deploys to GitHub Pages, and opens an issue if a source stops confirming a claim.

The page also tries a live shop read in the browser when the snapshot is from an older shop day.

## Files
| Path | What |
|---|---|
| `index.html`, `style.css`, `app.js` | The page. All scoring is in `app.js` |
| `shared/normalize.js` | Shop parsing, used by both the page and the updater |
| `scripts/update.mjs` | Data refresh and source verification |
| `config/rules.json` | Token rules, deadlines, confidence weights, fallbacks (edit this) |
| `config/events.json` | Expected events with sources (edit this) |
| `data/` | Generated. Do not edit by hand |
| `fixtures/` | Sample responses for offline testing |

## Set up on a fresh GitHub account (about 20 minutes)
GitHub only allows accounts created by a person, so you do step 1 yourself.

1. **Account.** Sign up at github.com/signup with an email used only for this, e.g. a new duck.com alias. Pick a neutral username: it becomes part of the URL (`<username>.github.io`). Turn on two-factor authentication (Settings > Password and authentication).
2. **Repository.** New repository > name `pirate-token-planner` > Public > no README > Create.
3. **Upload.** Install GitHub Desktop, sign in with the new account, clone the empty repo, copy this folder's contents into it (including the hidden `.github` folder), then commit and push. The browser's drag-and-drop upload often skips `.github`, so the automatic updates wouldn't run.
4. **Permissions.** Settings > Actions > General > Workflow permissions > **Read and write**.
5. **Pages.** Settings > Pages > Source: **GitHub Actions**.
6. **First run.** Actions > "Refresh shop data and deploy" > **Run workflow**. The site appears at `https://<username>.github.io/pirate-token-planner/`, and the red "Test data" banner disappears.

The `data/` files shipped here come from `fixtures/`. The first real run replaces them.

## Test locally
```
FIXTURE_DIR=fixtures node scripts/update.mjs   # offline, from sample files
node scripts/update.mjs                        # real data
python3 -m http.server 8000                    # open http://localhost:8000/?today=2026-11-20
```
`?today=YYYY-MM-DD` simulates another date.

Not affiliated with Epic Games. Shop data: fortnite-api.com (unofficial).
