# FIT-ARCADE

A browser-based, **markerless motion-controlled fitness arcade**. Your webcam turns real
movements — jump, squat, punch, lean, push-up, arm-raise — into controls for seven neon
arcade games. It also estimates your heart rate from the same camera (rPPG) and adapts
each game's difficulty to your effort. **No console, no wearables — just a camera.**

**Privacy:** all camera and pose processing runs **in your browser** — no video is ever
uploaded. Only anonymous, non-identifying usage metrics (with opt-out) are collected to
support research.

## Run locally
```bash
npm install
npm run dev        # Vite dev server
```
Open the printed URL. The webcam requires **HTTPS or `localhost`** (a browser security rule).

## Deploy
Static site → **GitHub Pages** via `.github/workflows/deploy.yml` (auto-deploys on push to
`main`). Any static host with HTTPS also works.

## Tech
Vanilla JS + Vite · MediaPipe Pose · Phaser 3 · Three.js · Web Audio (synthesized) · localStorage.
Core design is the **"motion seam"** that decouples pose sensing from the games (see `docs/`).

## Structure
| Path | What |
|---|---|
| `index.html` | the hub / shell |
| `phaser-*.html`, `three-*.html` | the games (loaded in iframes) |
| `js/` | pose detector, motion bus/bridge, rPPG, effort, difficulty, coach, audio |
| `css/`, `3d_assets/` | styles + 3D models + game sprites |
| `docs/`, `paper/`, `journal/` | research + design docs (not deployed) |

## License
_TODO — choose a license before public launch._
