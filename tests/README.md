# tests/ — smoke suite

End-to-end smoke tests for the portfolio site. Two layers:

1. **Static integrity** — every local asset referenced by `index.html` / `404.html`
   returns `200` (catches dangling `<script>`/`<link>` after refactors).
2. **Runtime behavior** — drives real Chrome via Playwright and asserts the
   JS-driven features work (hero, marquee, terminal, scroll-reveal, project
   planes, theme toggle, deep-link routing) with **no console errors**.

## Run it locally

```bash
bash tests/run.sh
```

This boots a GitHub-Pages-mimic server (`gh_pages_server.py`) on `:8137` against
the working tree, runs `smoke_test.py`, and tears the server down. Exit code is
the suite's result, so it can gate a push.

Requires Playwright. Locally it uses your **system Google Chrome** (no browser
download):

```bash
python3 -m pip install -r tests/requirements.txt
```

To use Playwright's **bundled Chromium** instead (what CI does):

```bash
python3 -m playwright install chromium
SMOKE_CHROME_CHANNEL="" bash tests/run.sh
```

The browser is chosen by `SMOKE_CHROME_CHANNEL` (default `chrome`; set empty for
bundled Chromium).

## Test the live site

```bash
bash tests/run.sh https://saile.codes      # smoke prod directly
bash tests/postdeploy.sh                    # wait for Pages to publish HEAD, then smoke prod
```

## CI

These scripts are the source of truth for GitHub CI:

- `.github/workflows/smoke.yml` — runs `tests/run.sh` on every pull request
  (required status check gating merges to `main`).
- `.github/workflows/postdeploy.yml` — after a push to `main` deploys, runs
  `tests/postdeploy.sh` to verify the live `saile.codes` serves the new commit.
