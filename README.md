# Lab Report Humanizer

Score how AI-generated a lab report reads, see the exact phrases that give it away, and rewrite them — **without ever changing your numbers, units, or citations.**

Lab reports are the hard case for both detection and humanizing: the register is formal and passive by convention, so the usual "AI tells" hide well, and you can never touch the measured data. This app is built around that constraint.

![engines: rule-based + AI](https://img.shields.io/badge/engines-rule--based%20%2B%20AI-22c55e) ![next](https://img.shields.io/badge/Next.js-16-black) ![no%20key%20needed](https://img.shields.io/badge/rule--based-no%20API%20key-38bdf8)

---

## What it does

1. **Detects** — gives an estimated **AI-likeness score (0–100%)** and a per-category breakdown, computed from the documented *Signs of AI writing* patterns plus structural signals (sentence-length uniformity, em-dash density).
2. **Highlights** — shows your text with every flagged phrase marked and explained on hover. Nothing is a black box.
3. **Humanizes** — rewrites the prose with one of two engines, then **re-scores the result** so you can see the before/after drop.

### An honest word on "AI detection"

There is **no reliable way to prove** a piece of text was written by an AI, and any product that claims otherwise is overselling. This tool does not claim certainty. It measures the *density of stylistic tells* that correlate with LLM output and shows you exactly what it found, so a human stays in the loop. Treat the score as a **writing-quality lens, not a verdict.**

---

## The two humanizer engines

| | Rule-based | AI (Vercel AI Gateway) |
|---|---|---|
| **API key** | None — works fully offline | Needs `AI_GATEWAY_API_KEY` |
| **How** | Deterministic, conservative word/phrase transforms | LLM rewrite with a lab-report-specific prompt |
| **Best for** | A guaranteed, explainable floor | Deep rewrites, natural rhythm, voice matching |
| **Output** | Instant + list of exact edits | Streamed token-by-token |

**Both engines protect your science.** Numbers, uncertainties (`3.2 ± 0.1`), units (`0.1023 M`, `23.45 mL`), chemical formulae (`C6H12O6`), scientific notation, and citations (`(Smith et al., 2019)`, `[3]`) are detected and locked before any rewrite, then restored untouched. The AI engine is additionally instructed never to alter a single measured value, result, or reference.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste a report (or click **Example**), and you'll see the score update live. Click **Humanize report** to rewrite it.

The **Rule-based** engine needs no setup. To enable the **AI** engine:

```bash
cp .env.example .env.local
# then set AI_GATEWAY_API_KEY in .env.local
```

Get a key from the [Vercel AI Gateway](https://vercel.com/ai-gateway), or link the project and pull env vars:

```bash
vercel link
vercel env pull .env.local
```

Change the model any time with `HUMANIZER_MODEL` (any AI Gateway `creator/model` string, e.g. `openai/gpt-4o`).

---

## How detection works

Each signal is a pattern with a weight. The final score combines three ingredients:

- **Stylistic-tell density** (dominant) — AI vocabulary (`delve`, `leverage`, `robust`…), filler (`it is important to note`), inflated significance (`plays a crucial role`), negative parallelism (`not only… but also`), vague attribution (`studies show`), superficial `-ing` tails, boilerplate conclusions, em-dash overuse, and more.
- **Flagged-sentence ratio** — how much of the document carries tells.
- **Robotic uniformity** — unusually low variation in sentence length.

Short inputs are deliberately pulled toward the middle so two sentences never scream "100% AI." Passive voice is weighted *gently* because it is normal and correct in scientific methods sections.

The engine lives in [`lib/detector.ts`](lib/detector.ts) and is pure, dependency-free TypeScript — it runs **live in the browser** for instant scoring and is also exposed at `POST /api/detect`.

---

## Project structure

```
app/
  layout.tsx            Fonts (Fira Sans/Code), theme bootstrap, metadata
  page.tsx              Renders the client workspace
  globals.css           Design system (dark-first, green "human" signal)
  api/
    detect/route.ts     POST { text } -> DetectionResult
    humanize/route.ts   POST { text, engine, strength, sample } -> text | JSON
lib/
  detector.ts           AI-pattern scoring engine (pure TS)
  humanize-rules.ts     Rule-based, data-safe humanizer (pure TS)
  prompt.ts             Lab-report system/user prompts for the AI engine
  sample.ts             Example AI-sounding report
components/
  workspace.tsx         Main client UI (state, streaming, tabs)
  score-gauge.tsx       Radial score gauge + band pill
  highlighted-text.tsx  Renders flagged spans with explanations
  icons.tsx             Inline SVG icon set
```

## API

**`POST /api/detect`**
```json
{ "text": "…your report…" }
```
Returns a `DetectionResult` (`score`, `band`, `summary`, `hits[]`, `sentences[]`, `categories[]`, `stats`).

**`POST /api/humanize`**
```json
{ "text": "…", "engine": "rules" | "ai", "strength": "light|balanced|thorough", "sample": "optional voice sample" }
```
- `engine: "rules"` → JSON `{ text, changes[] }`
- `engine: "ai"` → streamed `text/plain` (needs AI Gateway credentials; returns `503` otherwise)

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Vercel AI SDK 7** through the **AI Gateway** (no provider lock-in; swap models via one env var)
- **Node.js runtime** on Fluid Compute — streaming works with zero edge config
- **Tailwind v4** + a hand-built design system (Fira Sans / Fira Code)
- Zero runtime dependencies for the detection and rule-based engines

## Deploy

```bash
vercel
```

Add `AI_GATEWAY_API_KEY` in the Vercel project (or rely on OIDC on Vercel, which needs no key). The rule-based engine works on any host.

---

## Disclaimer

This tool helps you improve writing style and remove AI fingerprints. It does not certify authorship, and "humanized" output can still be identified by other systems. Use it responsibly and in line with your institution's academic-integrity policy — it is for editing your own work, not for misrepresenting it.
