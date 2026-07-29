# 8K Labels — Wine Label Generator

A wine-label generator for winemakers: enter your label details in an
interactive layout preview, describe your visual idea (and optionally upload a
reference sketch), and get the same label rendered in **six design styles** as
print-ready SVG — real millimetres, 5 mm safety margin, 2 mm bleed.

Built as a **Next.js app** that hosts the original battle-tested vanilla-JS
configurator **verbatim** (byte-for-byte, with automated proof), plus a
server-side API for AI artwork generation (OpenAI Images, with an offline mock
provider for free development).

📐 **[Full design document → docs/DESIGN.md](docs/DESIGN.md)** — architecture,
design decisions and rationale, the parity verification system, security
posture, roadmap.

🧭 **[Session handoff → CONTINUE-HERE.md](CONTINUE-HERE.md)** — current state,
fresh-machine setup, change workflow, what's next.

## Quick start

```bash
npm install                                       # Next 15 + React 19 + Playwright (uses system Chrome)
cd 8k-labels-package && node build.js && cd ..    # regenerate dist/configurator.html (the parity spec)
cp .env.example .env.local                        # IMAGE_PROVIDER=mock by default (free, offline)
npm run dev                                       # → http://localhost:3000
```

For real AI artwork: set `IMAGE_PROVIDER=openai` and `OPENAI_API_KEY=sk-...`
in `.env.local` (server-side only, gitignored) and restart.

## How it's put together

| Piece | Where |
|---|---|
| Original configurator source (the only editable UI/engine code) | [`8k-labels-package/src/`](8k-labels-package/src/) |
| Verbatim-transplanted scripts, HTML, CSS (generated — never hand-edit) | [`public/engine/`](public/engine/), [`src/app/shell-body.ts`](src/app/shell-body.ts), [`src/app/configurator.css`](src/app/configurator.css) |
| Host page (renders the original app, wires the backend hook) | [`src/app/page.tsx`](src/app/page.tsx) |
| Image generation API (mock + OpenAI providers) | [`src/app/api/generate-label-image/`](src/app/api/generate-label-image/), [`src/lib/image-provider/`](src/lib/image-provider/) |
| Parity proof system (golden SVGs, screenshot gates, e2e) | [`tests/parity/`](tests/parity/) |

## Verification

Every change to the configurator or engine must pass the parity gates:

```bash
npm run build            # production build
npm run golden:check     # engine: 144/144 SVGs byte-identical to the original
npx next start -p 3200   # then:
npm run capture:ported   #   screenshot 10 UI states
npm run compare:screens  #   0.000% pixel diff required
node tests/parity/test-imagegen.mjs http://localhost:3200   # generation e2e
```

Current status: **all gates green** — engine 144/144 byte-identical, UI
pixel-identical on all deterministic states, image pipeline e2e passing
(mock and live OpenAI verified).
