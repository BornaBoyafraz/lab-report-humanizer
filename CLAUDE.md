# CLAUDE.md — project guide & living log

This file is the source of truth for anyone (human or AI) working on **Lab Report Humanizer**.

> **Convention — keep this file alive:** whenever you generate or change something
> meaningful in this project, append a dated entry to the **Change Log** at the
> bottom. One line per change: what changed and why. This is how the project
> "updates itself" over time.

---

## What this project is

A web app that (1) estimates how **AI-generated** a lab report reads, (2) **highlights** the exact phrases responsible, and (3) **humanizes** the prose while never altering numbers, units, or citations.

The guiding constraint: **lab reports are the hard case.** Formal scientific register hides AI tells, and the measured data must survive any rewrite untouched. Every design decision serves that.

## Architecture (map)

| Area | File | Notes |
|---|---|---|
| Detection engine | `lib/detector.ts` | Pure, dependency-free TS. Runs in the browser (live scoring) **and** server (`/api/detect`). Signal catalogue + weights live here. |
| Rule-based humanizer | `lib/humanize-rules.ts` | Deterministic, offline. **Protects** data/units/formulae/citations via a placeholder vault before transforming. |
| AI prompts | `lib/prompt.ts` | Lab-report system prompt with ABSOLUTE RULES (never touch data) + strength presets. Reads `HUMANIZER_MODEL`. |
| Sample | `lib/sample.ts` | Deliberately AI-sounding example report. |
| Detect API | `app/api/detect/route.ts` | `POST { text }` → `DetectionResult`. |
| Humanize API | `app/api/humanize/route.ts` | `POST { text, engine, strength, sample }`. Rules → JSON; AI → streamed text. Returns `503` if no gateway key. |
| UI | `components/workspace.tsx` | Client component: state, live detection, streaming reader, tabs. |
| UI parts | `components/{score-gauge,highlighted-text,icons}.tsx` | Gauge, highlight renderer, inline SVG icons. |
| Design system | `app/globals.css` | Dark-first, green = "human" signal, Fira Sans/Code. Tokens on `:root`, light via `[data-theme="light"]`. |

## Conventions

- **Never break the data contract.** Any new humanizing logic must preserve numbers, uncertainties (`±`), units, chemical formulae, scientific notation, and citations. The rule-based engine does this with `PROTECT_PATTERNS`; the AI engine does it via the system prompt. Test with `lib/sample.ts` (it contains `23.45 ± 0.12 mL`, `0.1023 M`, `C1V1 = C2V2`).
- **Detection is a lens, not a verdict.** Keep the honesty framing in the UI and docs. Do not claim to "prove" AI authorship.
- **Passive voice is OK** in lab reports — weight it gently in the detector, don't force active voice in the humanizer.
- **No emojis as icons** — use `components/icons.tsx` (SVG).
- **Keep the detection engine pure** (no Node/DOM APIs) so it can run on both client and server.
- **Theme:** tokens defined on `:root` (dark) and overridden under `:root[data-theme="light"]`.

## Run / build

```bash
npm run dev        # http://localhost:3000
npm run build      # production build + typecheck
npm run lint       # eslint
```

## Environment

- `AI_GATEWAY_API_KEY` — enables the AI engine (optional; rule-based needs nothing).
- `HUMANIZER_MODEL` — AI Gateway `creator/model` string, default `anthropic/claude-sonnet-4.5`.
- On Vercel, OIDC can replace the key.

## Ideas / backlog

- Export the highlighted report as annotated PDF/HTML.
- Per-sentence rewrite (click a flagged sentence to rewrite just that one).
- Upload `.docx`/`.pdf` and extract text.
- Save the detector's weights to a config file for tuning without code edits.
- Unit tests for `detector.ts` and the data-protection vault in `humanize-rules.ts`.

---

## Change Log

- **2026-11-09** — Initial build. Scaffolded Next.js 16 + React 19 + TS + Tailwind v4. Added pure-TS AI-pattern detector (`lib/detector.ts`), data-safe rule-based humanizer (`lib/humanize-rules.ts`), AI engine via AI SDK 7 + AI Gateway with lab-report prompt (`lib/prompt.ts`, `app/api/humanize`), `/api/detect`, and the full workspace UI (live scoring, highlight view, streamed AI rewrite, before/after re-score). Dark-first design system with Fira fonts. Added README and this file.
