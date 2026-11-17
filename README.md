# Factory Dashboard & Flow Hub (`factory-dashboard-hub`)

Self-contained offline React + TypeScript application that ingests the **LEAN CELL DESIGN: FACTORY DASHBOARD** Excel workbook (`.xlsx`) in any state, audits gaps using all **34 Data Check rules**, provides guided gap-filling with dropdowns, toggles, and hover help popovers, and runs live Headroom, Model vs. Passport Compare, Lead-Time/WIP Flow View, What-If Scenarios, Gate Assessor, and Risk Register tools.

---

## 1. Quick Start for Engineers (Offline Usage)

1. **Download the Latest Offline App (1-Click Direct Link):**
   - Open: `https://github.com`
   - *(If transferring via corporate email, rename `index.html` to `index.txt`, send it, then rename back to `index.html`.)*
2. **Open in Microsoft Edge or Chrome:**
   - Double-click `index.html` locally—runs 100% offline with zero internet or CDN calls.
3. **Ingest & Fill Gaps:**
   - Drop your `.xlsx` workbook onto the upload panel (or click **Load Demo Workbook** to explore).
   - Review the **Data Check Gap Summary** (`ERROR`, `WARN`, `INFO`) and click any flagged item to jump straight to that row with dropdowns, toggles, and hover `ⓘ` help popovers.
   - Use **Link Auto-Save (`.json`)** for live network-drive backups, or export back to `.xlsx` / print pack when finished.

---

## 2. Standard Solo Workflow (Zero GitHub PR Friction)

To avoid branch conflicts and Pull Request overhead on mobile/web:

1. **New Repo Rule (`://github.com`):**
   - Always tick **Add a README file** when creating a repository so `main` is initialised as the permanent default branch immediately.
2. **Model & Effort Selection (`claude.ai/code`):**
   - **Initial multi-file build:** `Sonnet 5.5` + `Medium` effort (`Ultracode` ON).
   - **Follow-up tweaks & bug fixes:** `Sonnet 5.5` + `Low` effort.
   - Avoid `Fable` models (billed separately via usage credits).
3. **Standard Prompt Footer (Paste at the end of every request):**
   > Run `tsc` and all tests, rebuild `dist-offline/index.html` (`git add -f dist-offline/index.html`), and push directly to `main` (`git checkout -B main && git push -f origin main`) so `main` stays our single clean branch with no open PRs.

---

## 3. Automated Rules for `claude.ai/code`

Whenever modifying this repository, always obey these rules:

- **Single-Branch Policy (`main`):** Always commit and push directly to `main` (`git checkout -B main && git push -f origin main`). Do not leave open feature branches or require manual Pull Request merges unless explicitly asked.
- **Offline Single-File Build:** Every code change MUST rebuild and force-commit `dist-offline/index.html` (`npm run build:offline && git add -f dist-offline/index.html`). Zero external runtime CDNs are permitted.
- **Domain & Language Standards:**
  - Use **British English** throughout (`utilisation`, `despatch`, `analyse`, `programme`, `£`, `m²`).
  - Never use retail terminology; use **Product Family / FPD / Variant**.
  - Keep all calculation logic decoupled from React UI components and verified against the **10-Point Mathematical Self-Test** (`0.001%` tolerance) and **34 Workbook Data Check Rules**.
- **Workbook Ingestion Compatibility:**
  - Preserve support for dual-block `Data` tabs (`FACTORY MODEL` on left, `ASSET LINE: PASSPORT (OEE-adjusted)` on right), `Quantity` -> machine count mapping, multi-line headers (`Asset (blank on a cell line)`, `Demand (units / yr)...`), strict separation of Cell summary rows vs. Asset rows, and custom shift patterns (`1 Shift` through `6 Shifts`, `Continuous 24/7`, `2 Shifts + Sat`, `3 Shifts + Sat`).

---

## 4. Local Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start local dev server
npm test                 # Run unit & calculation engine tests
npm run build:offline    # Build standalone dist-offline/index.html
```
