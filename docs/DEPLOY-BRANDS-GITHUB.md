# Deploying the four brand websites to separate GitHub accounts

**Goal:** give Loom, KnitNet, Fiber and Plexus each their own GitHub Pages URL, hosted from **new GitHub accounts that are not `febuz`**.

---

## Why separate accounts?

- Each brand has its own narrative, search footprint and link graph.
- A dedicated GitHub account keeps the brand identity clean (`https://<brand>.github.io`).
- The main `virtuanalytica/virtualpc` repository remains the canonical machine; the brand sites are lenses.

---

## Step 1 — Create four new GitHub accounts

1. Sign out of GitHub or use an incognito window.
2. Create four new accounts. Suggested usernames (check availability first):
   - `loom-textus`
   - `knitnet-fabric`
   - `fiber-textus`
   - `plexus-archive`
3. Verify the e-mail addresses for each account.
4. Generate a **classic personal access token** per account with the `repo` and `workflow` scopes.
   Save them securely (e.g., a password manager). You will use them in the deploy script.

> **Security tip:** use fine-grained tokens if possible, scoped to the single repository you are about to create.

---

## Step 2 — Run the local deploy script

A helper script prepares a minimal Pages site for each brand and pushes it to the corresponding account.

```bash
# From the repo root
bash scripts/deploy-brand-to-github.sh \
  loom-textus \
  knitnet-fabric \
  fiber-textus \
  plexus-archive
```

The script will:

1. Create `tmp/brands/<brand>/` with:
   - `index.html` (the brand landing page)
   - `logos/<brand>-logo.svg`
   - `README.md`
2. Initialise a git repository in each folder.
3. Add the remote `https://<token>@github.com/<brand>/<brand>.github.io.git`.
4. Push the `main` branch.

If you have not set `GITHUB_TOKEN_<BRAND>` environment variables, the script prompts for each token.

---

## Step 3 — Enable GitHub Pages

For each new account:

1. Create a new public repository named **exactly** `<username>.github.io`.
2. Push the site to the `main` branch.
3. Go to **Settings → Pages**.
4. Select **Deploy from a branch → main → / (root)**.
5. Wait 1–3 minutes.

The site will be live at `https://<username>.github.io`.

---

## Step 4 — Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://loom-textus.github.io
curl -s -o /dev/null -w "%{http_code}\n" https://knitnet-fabric.github.io
curl -s -o /dev/null -w "%{http_code}\n" https://fiber-textus.github.io
curl -s -o /dev/null -w "%{http_code}\n" https://plexus-archive.github.io
```

Expected: `200` for each.

---

## Updating a brand site later

Re-run the generator and the deploy script:

```bash
python3 scripts/generate-brand-pages.py
bash scripts/deploy-brand-to-github.sh loom-textus knitnet-fabric fiber-textus plexus-archive
```

Only changed files will be committed and pushed.

---

## Cross-linking strategy

Each brand site should link back to the others and to the brain:

- **Brain / machine:** `https://github.com/virtuanalytica/virtualpc`
- **Brand hub:** `https://febuz.github.io/virtualpc/brands.html` (or your custom domain)
- **Sibling brands:** direct links to the other three GitHub Pages URLs

Keep the URLs in `docs/BRAND-STRATEGY.md` up to date.

---

## Custom domains (optional)

If you buy domains such as `loom.dev`, `knitnet.org`, `fiber.db` or `plexus.archive`:

1. Add a `CNAME` file to each brand site containing the domain.
2. Configure DNS with your registrar:
   - `CNAME loom.dev → loom-textus.github.io`
   - etc.
3. Enable HTTPS in **Settings → Pages → Custom domain**.

---

## Limitations

- GitHub Pages sites for free accounts are public.
- Each account should have its own e-mail for account recovery.
- GitHub may rate-limit rapid account creation; space registrations by a few minutes.
