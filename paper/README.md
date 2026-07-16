# FIT-ARCADE — SDPS 2026 Paper

**Title:** FIT-ARCADE: A Transdisciplinary Architecture for Markerless, Personalized Motion Exergaming

**Venue:** SDPS 2026 — Society for Design and Process Science, Brussels, Belgium

**Format:** Springer LNCS (`llncs.cls`)

## Two versions

| File | Length | Bib | Notes |
|------|--------|-----|-------|
| `main.tex` | full (~10–13 pp) | `references.bib` (26 refs) | Comprehensive draft: 7 figures, 6 tables, 2 algorithms. |
| **`main-short.tex`** | **~10 pp incl. references** | **`references-short.bib` (19 refs)** | **Condensed version.** 3 figures (architecture, in-game, latency), 2 tables, 1 algorithm. Recent-leaning references (2023–2025). Build this for the 10-page target. |

**Author list note:** both files use the same seven authors, corresponding author `sanket.salvi@mitwpu.edu.in`. Per the latest request, `main-short.tex` replaces *Pramod Jain SA* with **Anita Thengade** (`anita.thengade@mitwpu.edu.in`). `main.tex` still has the original list — update it to match if you submit the full version.

**Recent references added in the short version (verified real):**
- Chen et al., *Comparison of Exergames Versus Conventional Exercises…*, JMIR Serious Games 11:e42374 (2023), doi:10.2196/42374
- Hii et al., *Automated Gait Analysis Based on a Marker-Free Pose Estimation Model*, Sensors 23(14):6489 (2023), doi:10.3390/s23146489
- Debnath & Kim, *A Comprehensive Review of Heart Rate Measurement Using rPPG and Deep Learning*, BioMedical Engineering OnLine 24:73 (2025), doi:10.1186/s12938-025-01405-5

## How to Build

```bash
# 10-page short version (recommended):
pdflatex main-short && bibtex main-short && pdflatex main-short && pdflatex main-short

# full version:
pdflatex main && bibtex main && pdflatex main && pdflatex main
```

**Prerequisites:**
- LaTeX distribution (TeX Live or MiKTeX) with `amsmath`, `algorithm`, `algpseudocode`, `booktabs`, `hyperref`, `todonotes`, `graphicx` packages.
- The Springer LNCS class file `llncs.cls` (download from [Springer](https://www.springer.com/gp/computer-science/lncs/conference-proceedings-guidelines)).
- Place `llncs.cls` and `splncs04.bst` in the `paper/` directory or your TeX path.

## File Structure

```
paper/
├── main.tex            # Complete paper (~10 pages LNCS, trimmed)
├── references.bib      # BibTeX references
├── README.md           # This file
└── figures/
    ├── architecture.png  # Fig 1: Layered architecture diagram (generated)
    ├── sequence.png      # Fig 2: Sequence diagram (generated)
    └── (latency.png)     # Fig 7: Seam latency histogram (TODO)
```

## Figure Status

| Figure | Status | Notes |
|--------|--------|-------|
| Fig 1 — Architecture Diagram | ✅ Generated | `figures/architecture.png` — AI-generated; consider redrawing in TikZ for camera-ready |
| Fig 2 — Sequence Diagram | ✅ Generated | `figures/sequence.png` — AI-generated; consider Mermaid/TikZ for camera-ready |
| Fig 3 — Home dashboard | ✅ **Real capture** | `figures/home-dashboard.jpg` — captured from the live app (progression panel + 7-game grid) |
| Fig 4 — In-game views (3 panels) | ⚠️ **Author drop-in** | `figures/ingame-rooftop.jpg`, `ingame-jetpack.jpg`, `ingame-hoverboard.jpg`. The WebGL game canvas cannot be read back via `toDataURL`, so these could not be auto-captured. Save the three supplied high-res in-game screenshots under these names. Labelled placeholders render automatically until then (`\IfFileExists`). |
| Fig 5 — Calibration screen | ✅ **Real capture** | `figures/calibration.jpg` — captured live (9-step protocol) |
| Fig 6 — Workout summary | ✅ **Real capture** | `figures/summary.jpg` — captured live (stats + neon share card) |
| Fig 7 — Latency Histogram | ✅ **Real measurement** | `figures/latency.jpg` — one-way seam latency, N=600 samples measured live via a `performance.now()` echo probe across the `postMessage` seam while a Phaser game rendered. Median 1.65 ms, p95 6.05 ms, max 8.6 ms |

> Screenshots showing the camera box display a “camera error / initializing” state because the capture environment had no webcam. The three supplied in-game screenshots (Fig 4) show the live pose skeleton in the camera box and are the preferred camera-ready assets.

## Remaining Author Tasks (Checklist)

### Before Submission

- [x] **Author names and affiliations added** — 7 authors, Dr. Vishwanath Karad MIT World Peace University, Pune; `sanket.salvi@mitwpu.edu.in` is the corresponding author.
- [ ] **Obtain `llncs.cls`** from Springer and place in `paper/` directory (a copy is present; verify it is the current version).
- [ ] **Confirm `marvosym` is installed** (provides the `\Letter` corresponding-author glyph). If unavailable, replace `\textsuperscript{(\Letter)}` in `\author{}` with `\textsuperscript{*}` and drop the package.
- [ ] **Drop in the three in-game screenshots (Fig 4):** save the supplied high-res captures as `figures/ingame-rooftop.jpg`, `figures/ingame-jetpack.jpg`, `figures/ingame-hoverboard.jpg`. Until then, labelled placeholders render automatically.
- [x] **Figs 3, 5, 6 captured live** — home dashboard, calibration, summary.
- [x] **Fig 7 latency measured live** — real histogram from N=600 samples.
- [ ] **Verify all citations** — search for `\todo{verify}` in `references.bib`. Cross-check DOIs and page numbers.
- [ ] **Review the companion paper reference** `[companion2026]` — update with real citation details when available.
- [ ] **Re-draw diagrams** (Figs 1–2) in TikZ or a vector tool for camera-ready quality.
- [x] **Trimmed toward ~10 pages** — §2 (Related Work) condensed from six paragraphs to three; the DP-walkthrough table removed (E4 is now compact prose); §8.2 folded into a paragraph; all figures reduced in width. Recompile and fine-tune (e.g. `\vspace` around floats) if it still overruns by a fraction; the two algorithms and equations are core contributions and were kept intact.
- [ ] **SDPS-specific formatting** — the venue supplied a Springer `splnproc` (SPLNPROC) Word template under `paper/SDPS_2026_Paper_Template/`. LNCS (`llncs`) and SPLNPROC are visually equivalent Springer proceedings formats; confirm which the chairs require for the final submission.
- [ ] **Resolve remaining `\todo{}`** markers (the Fig 4 drop-in note and any `\todo{verify}` citations).

### Alternate Title Options (choose one)

1. **FIT-ARCADE: A Transdisciplinary Architecture for Markerless, Personalized Motion Exergaming** *(current)*
2. FIT-ARCADE: Decoupling Disciplines via a Motion-Seam Architecture for Browser-Based Exergaming
3. The Motion Seam: A Transdisciplinary Design Pattern for Markerless, Engine-Agnostic Exergaming

### Scope Boundary Reminders

This paper is the **design/architecture** paper. It must NOT include:
- rPPG equations or signal-processing details
- Effort/difficulty control-law formulas
- Personalization model internals
- Human-subjects or efficacy results
- Accuracy evaluations of sensing

These are all in the **companion journal paper** (`\cite{companion2026}`).
