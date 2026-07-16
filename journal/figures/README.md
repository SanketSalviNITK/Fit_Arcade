# figures/

The three **schematic** diagrams (signal-flow, rPPG block, control) are drawn with
**TikZ inline in `../main.tex`** — no image files are needed and they compile with
the paper.

Two **data** figures are currently placeholder boxes in `main.tex` and must be
produced from the study data, then dropped here and `\includegraphics`'d:

| File to add | Figure | Source study |
|---|---|---|
| `bland_altman.pdf` | Bland–Altman + correlation scatter, gated rPPG vs. reference HR | S1 |
| `ablation_mae.pdf` | MAE, gated vs. ungated, binned by motion intensity (**headline**) | S2 |

Suggested pipeline: log per-frame `{t, bpm, confidence, motionLevel}` from
`js/rppg.js` alongside the time-synced reference-device HR, then plot with
matplotlib/R. Use vector PDF at ~3.5 in (single-column) width; keep fonts ≥ 8 pt.
