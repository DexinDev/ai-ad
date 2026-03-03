## OOH Creative Analyzer (MVP)

Offline-friendly MVP for analyzing OOH creatives (billboards, large-format images) from PNG/JPG/JPEG/PDF inputs and generating:

- **input preview** (`input_preview.png`)
- **planning brief** (`brief.json`)
- **analysis result** (`result.json`)
- **one-page PDF report** (`report.pdf`)

### Quick start

1. **Install dependencies**

```bash
npm install
```

> Note: `puppeteer` will download a local Chromium build and `canvas` may require system packages (e.g. Cairo, Pango). If install fails, see _Troubleshooting_.

2. **Prepare inputs**

- Put test creatives into the `samples/` folder  
  (PNG, JPG, JPEG, or PDF. For PDFs only the first page is used.)

3. **Run analysis (offline-only)**

```bash
npm run analyze -- --input ./samples --output ./out
```

Optional KPI override:

```bash
npm run analyze -- --input ./samples --output ./out --kpi brand
```

To additionally use an online LLM (OpenAI) to refine advanced metrics, set
`OPENAI_API_KEY` in your environment and add the `--llm` flag:

```bash
OPENAI_API_KEY=sk-... npm run analyze -- --input ./samples --output ./out --llm
```

### Output structure

For each processed input file, a job folder is created under your chosen output directory:

```text
./out/<jobId>/
  input_preview.png
  brief.json
  result.json
  report.pdf
```

- **`input_preview.png`** – normalized sRGB PNG preview, max width 2048px.
- **`brief.json`** – minimal planning brief with goals, context, and simulation defaults.
- **`result.json`** – metrics, subscores, assumptions, recommendations, and version info.
- **`report.pdf`** – one-page visual summary rendered from `templates/report.html`.

### CLI

The CLI is implemented in `src/cli.ts` using `commander`.

Arguments:

- **`--input <path>`**: file or directory with creatives.
  - If a directory is provided, supported files one level deep are processed.
- **`--output <path>`**: output directory. Created if it does not exist.
- **`--kpi <readability|brand|cta_qr>`** (optional): primary KPI, default `readability`.

At the end, the CLI prints a summary:

```text
Done. Processed X file(s), failed Y. Outputs at: /absolute/path/to/out
```

### Metrics and scoring (MVP heuristics)

All analysis is done **without heavy OCR/ML**, using simple image statistics and
lightweight heuristics:

- **Orientation**: `horizontal` · `vertical` · `square` from aspect ratio.
- **Image stats**:
  - `meanLuma` / `stdLuma` (0–1) from Rec.601 luminance, used as a contrast proxy.
  - `colorfulness` using a simple Hasler/Susstrunk-style RG/YB metric.
- **Edge density**:
  - Image is downscaled to ~512px width, converted to grayscale.
  - A Sobel filter is applied; percentage of pixels above a threshold gives edge density (0–1) as a clutter proxy.
- **Text likelihood (heuristic)**:
  - If edge density and luminance variance are both high → marked as `high`.
  - Otherwise `medium` or `low`.
- **Scores (0–100)**:
  - `contrastScore` from luminance standard deviation.
  - `clutterScore` as inverse of edge density.
  - `readabilityScore` derived from contrast + clutter (weighted).
  - `overallScore` approximates readability and is mapped to `status` (`needs_work` | `ok` | `excellent`).
  - Subscores:
    - `readability`, `contrast_color`, `clutter` are derived directly from the metrics.
    - `visual_hierarchy`, `cta_qr`, `brand`, `contact_time_fit` are **heuristic proxies** built from readability, clutter, color, and text likelihood (no OCR or logo/QR detection).
    - `legal_compliance` remains a neutral placeholder (60); there is **no legal/compliance model** in the MVP. The assumptions section in `result.json` lists which checks are not implemented yet.

### Recommendations

Up to five recommendations are generated per creative:

- **Contrast**: if contrast is low → “Increase text/background contrast (target ≥ 4.5:1)”.
- **Clutter**: if clutter score is low → “Reduce background details / simplify layout”.
- **Orientation**: if horizontal → notes that billboard defaults (5.5m, 40km/h) were applied.
- **Assumptions**: always includes “Assumptions used: height 5.5m, speed 40km/h, 45° at 15m”.
- **Message focus**: if readability is weak → “Prioritize one clear primary message…”.

Each recommendation in `result.json` includes a rough `expectedGain` (e.g. +5..+15).

### Implementation notes

- **Tech stack**
  - Node.js + TypeScript.
  - `sharp` – raster loading, sRGB normalization, resizing, and raw pixel access.
  - `pdfjs-dist` + `canvas` – first-page PDF → PNG for preview & metrics.
  - `puppeteer` – headless Chromium to render `templates/report.html` → `report.pdf`.
  - `commander` – CLI argument parsing.
  - `uuid` – per-file `jobId`.
  - `ajv` – minimal schema validation for `brief.json` and `result.json`.

- **Offline behavior**
  - After `npm install` finishes (Chromium downloaded once), the analyzer itself runs fully offline.
  - All metrics and reports are computed locally on CPU; no external services are called.

### Troubleshooting

- **Puppeteer install fails / Chromium download blocked**
  - Ensure `npm install` is allowed to download Chromium once, or provide a compatible `PUPPETEER_EXECUTABLE_PATH` to an existing Chrome/Chromium installation.

- **`canvas` native build issues**
  - On macOS, install system deps, for example:

    ```bash
    brew install pkg-config cairo pango libpng jpeg giflib librsvg
    ```

  - Then re-run `npm install`.

- **PDFs that fail to render**
  - The tool will log: “PDF render failed, please export to PNG”.
  - Workaround: export the PDF page to a PNG/JPEG and re-run the analyzer on that image.

### Development

- **Build TypeScript**

```bash
npm run build
```

- **Basic tests (placeholder)**

```bash
npm test
```

The initial version only contains minimal checks for scoring helpers and is intended as a starting point for further expansion (more robust metrics, OCR, and ML-based models).

