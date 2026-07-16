# FIT-ARCADE — IEEE Journal Paper (Sensing & Adaptation)

**Working title:** *Motion-Robust Contactless Heart-Rate Sensing and Personalized Closed-Loop Difficulty for Markerless Exergames*

**Target venue:** IEEE Journal of Biomedical and Health Informatics (JBHI).
Alternatives: IEEE Trans. on Games; IEEE Trans. on Biomedical Engineering; IEEE Trans. on Human-Machine Systems.

**Class:** IEEEtran (journal, two-column, 10 pt).

## Scope boundary (important)
This paper is the **sensing + adaptation + evaluation** paper. It is deliberately **mutually exclusive** with the companion **SDPS architecture paper** (`../paper/`). Anything architectural — the motion-seam, MotionBus/MotionBridge, `postMessage`, `MOTION_MAP`, keyCode-override, engine-agnosticism, the games' mechanics, pseudo-3D projection, coaching broadcast, the DP1–DP5 design principles — is **cited to `\cite{fitarcade-sdps}` and never re-described here.** This paper owns: motion-gated pose-reuse rPPG, the fused effort estimator, the personalized closed-loop controller, and the human-subjects evaluation.

## Build (local)
```bash
pdflatex main
bibtex main
pdflatex main
pdflatex main
```
`IEEEtran.cls` (v1.8b) and `IEEEtran.bst` (v1.14) are **bundled in this folder**, so no separate install is needed. All other packages (`amsmath`, `algorithm`, `algpseudocode`, `booktabs`, `array`, `tikz`, `hyperref`, `xcolor`, `graphicx`, `url`) ship with any standard TeX Live / MiKTeX.

## Build (Overleaf)
1. Zip the **contents** of this folder (or use the provided `journal-overleaf.zip`) and in Overleaf choose **New Project → Upload Project**.
2. Overleaf already includes `IEEEtran`; the bundled copies are harmless and keep the project portable.
3. Set **Menu → Main document = `main.tex`**, **Compiler = pdfLaTeX**. The bibliography uses BibTeX (Overleaf runs it automatically).
4. **No image files are required** — the schematic figures are inline TikZ and the two data figures are placeholder boxes until real plots are added.

## Draft markers
- `\todoNote{...}` (red) — an author task.
- `\result{...}` (blue, underlined) — a quantitative value to fill **once data are collected**. **Nothing is fabricated.**
- `\ph{...}` (blue angle-brackets) — a study parameter to finalize (N, IRB #, device, FPS, distance…).

## Files
```
journal/
├── main.tex       # full manuscript (IEEEtran)
├── refs.bib       # references (classics accurate; "% VERIFY" lines need confirming)
├── IEEEtran.cls   # IEEE journal class v1.8b (bundled)
├── IEEEtran.bst   # IEEE BibTeX style v1.14 (bundled)
├── README.md      # this file
└── figures/       # data-plot placeholders live inline in main.tex; see figures/README.md
```

## Figure / table status
| Asset | Status | Notes |
|---|---|---|
| Fig. signal-flow | ✅ TikZ (in `main.tex`) | camera → pose → rPPG/effort → controller → game |
| Fig. rPPG block diagram | ✅ TikZ | ROI → POS → periodogram → motion gate → hold |
| Fig. control loop | ⚠️ folded into method text/Alg. 2 | add a dedicated TikZ loop diagram if a reviewer wants it |
| Fig. Bland–Altman + scatter | ❌ placeholder box | needs S1 data |
| Fig. gating ablation bar | ❌ placeholder box | needs S2 data (headline) |
| Table: personalization | ✅ real | computed from `computeBasePace` (index.html) |
| Table: rPPG baselines | ⚠️ structure real, cells `\result{}` | needs S3 data |
| Alg. 1 (motion-gated rPPG) | ✅ real | grounded in `js/rppg.js` |
| Alg. 2 (effort + control) | ✅ real | grounded in `js/effort.js`, `index.html` |
| All equations | ✅ real | constants match the code (see below) |

## Constants grounded in code (verified)
- rPPG (`js/rppg.js`): window `W=10 s`, `minSamples=60`, ROI `48×48`, forehead box `0.55w_f × 0.45w_f` at `y_e−0.35w_f`; POS `S1=Gn−Bn`, `S2=−2Rn+Gn+Bn`, `α=σ(S1)/σ(S2)`; periodogram 40–180 bpm on real timestamps; confidence `min(1, P*/8P̄)`; motion EMA `0.7/0.3`, `τ=0.12`, penalty `max(0,1−m/τ)`; hold gate `c≥0.25`, HR EMA `0.7/0.3`; `maxHR=220−age`; zones `{0.5,0.6,0.7,0.85}`.
- Effort (`js/effort.js`): window `20 s`, `repsForMax=50`, blend `0.5/0.5` gated at `c≥0.3` (cadence-only fallback), EMA `0.6/0.4`.
- Control (`index.html`): `d ← clip(d+0.18(θ−E), 0.85, 1.2)`, `T_c=2 s`, command `π=p0·d`; per-phase targets warm-up 0.40 / HIIT 0.60 / cool-down 0.35 (default 0.55).
- Personalization (`index.html computeBasePace`): `f_age=clip(1−0.3·max(0,a−20)/50, 0.7,1.0)`, `f_fit∈{0.85,1.0,1.15}`, `f_rhr=clip(1+(60−rest)/400, 0.94,1.06)`, `p0=clip(f_age·f_fit·f_rhr, 0.55,1.2)`.

## Author checklist (before submission)
### Data / study
- [ ] **Obtain IRB/ethics approval**; fill `\ph{IRB_NUMBER}`, add PAR-Q + consent.
- [ ] **Pre-register** hypotheses and analysis plan.
- [ ] Finalize `\ph{}` params: N (+ power analysis), reference device, camera spec, FPS, distance, lighting.
- [ ] Run S1–S6; fill every `\result{}` with value + 95% CI + effect size; correct for multiplicity.
- [ ] Generate the two real figures (Bland–Altman; ablation bar) into `figures/` and `\includegraphics` them.
- [ ] Populate Table `tab:baselines` (implement/borrow green/CHROM/ICA/POS + a DL baseline; leave-one-subject-out).
### Writing / metadata
- [ ] Fill `[AUTHOR_LIST]`, `[CORRESPONDING_EMAIL]`, `[AFFILIATION]` (reuse SDPS authors unless changed).
- [ ] Resolve every `\todoNote{}` (search the source).
- [ ] **Add 4–6 recent (2023–2025) IEEE JBHI papers** and confirm all `% VERIFY` bib entries.
- [ ] Replace `\cite{fitarcade-sdps}` note once the SDPS paper has a citable reference.
- [ ] Confirm the final target journal and swap template/`.bst` if not JBHI.
- [ ] Check page length (target ~10–14 double-column pages) and IEEE formatting.

### ⚠️ Patent / disclosure timing
Publishing this or the SDPS paper (or a public demo/preprint) is a **public disclosure** that can start/forfeit patent windows. If the *pose-velocity-gated rPPG for closed-loop exergaming* method might be filed, consult a patent attorney **before** the first disclosure.
