# FIT-ARCADE — WiFi/CSI Capture-Node Spec

The companion to [research-logging.md](research-logging.md). The app already emits
time-stamped **pose labels**; this document specifies the **RF capture node** that
records the WiFi signal in parallel, and how the two are fused into training pairs.

> **RSSI vs CSI (read first).** RSSI is one coarse scalar per packet — usable for gross
> activity/rep classification, **not** joint-level pose. Fine-grained pose needs **CSI**
> (amplitude **+ phase** across OFDM subcarriers). This spec targets **CSI**, and logs
> RSSI alongside it for free.

---

## 1. Hardware options

| Platform | Tool | Subcarriers / BW | Cost | Verdict |
|---|---|---|---|---|
| **ESP32** | [ESP32-CSI-Tool](https://github.com/StevenMHernandez/ESP32-CSI-Tool) | ~52 usable (HT20), 2.4 GHz, 1 antenna | **~$5** | ✅ **Start here** — cheapest, fastest to a first dataset |
| **Raspberry Pi** (bcm43455c0: Pi 3B+/4/Zero 2 W) | [Nexmon CSI](https://github.com/seemoo-lab/nexmon_csi) | up to 256 (80 MHz) | ~$40 | Higher-res; firmware patching is finicky |
| **Intel 5300** laptop | [Linux 802.11n CSI Tool](https://dhalperi.github.io/linux-80211n-csitool/) | 30 groups × up to 3×3 MIMO | used ~$30 | Classic, well-documented; needs old kernel/NIC |
| Atheros AR9xxx | Atheros CSI Tool | 56/114 | used | Similar era to Intel 5300 |
| AX210 / USRP | [PicoScenes](https://ps.zpj.io/) | 802.11ax, many NICs | $$$ | Publication-grade; steeper setup |

**Recommendation:** two **ESP32s (~$10 total)** for the MVP dataset → prove alignment +
a simple activity classifier; then move to **Nexmon (Pi)** or **Intel 5300** for
publication-grade CSI once the pipeline works.

---

## 2. Physical topology
CSI = how the body reshapes the channel between a **transmitter (Tx)** and **receiver (Rx)**.

- **Starter (1 link):** Tx = a second ESP32 (or your home AP) spraying packets; Rx = the
  CSI ESP32. Person exercises in the ~1–3 m line-of-sight/near-field between them, facing
  the FIT-ARCADE screen + webcam.
- **Better (2–3 links):** add Rx nodes at different angles → spatial diversity → far better
  pose reconstruction. This is what DensePose-from-WiFi / WiPose use.
- Log an **empty-room baseline** each session (static-channel reference).

```
        [FIT-ARCADE screen + webcam]  ← pose labels
                    |
              (person moving)
        Tx (ESP32/AP) ~~~~~~~~~~~~~~~~~ Rx (ESP32 CSI)  → CSI labels
```

---

## 3. What the node emits (schema — matches the collector)
The node POSTs **newline-delimited JSON** to the same collector as the app
(`POST http://<collector-ip>:8787/log`, `text/plain`), one record per CSI packet:

```json
{"t_wall":1784056402413,"type":"csi","dev":"esp32-rx-a","seq":10432,
 "rate":100,"rssi":-51,"nsub":52,"ant":0,
 "amp":[/* per-subcarrier magnitude */],"phase":[/* per-subcarrier phase, rad */]}
```
Both streams land in **one file, one wall clock**. Keep field names short (this runs at
100s Hz). For ESP32 you can POST raw CSI ints and convert offline; `amp`/`phase` shown for
clarity.

---

## 4. Time synchronization (the crux)
Pose is ~30 Hz; CSI is 100–1000 Hz. Target **sub-100 ms** alignment. Layered approach:

1. **Coarse — NTP/SNTP on every device**, then pair on `t_wall`. ESP32 SNTP is ~10–50 ms
   accurate (fine as a base). Pi/laptop NTP is tighter.
2. **Anchor — the sync pulse.** In the app, `DataLogger.mark('sync')` writes a `sync`
   record **and flashes the screen white ~120 ms**. Capture that pulse on the RF node with
   one of:
   - a **$0.20 photoresistor/LDR** taped to the screen, read by the ESP32 → it writes its
     own `{"type":"sync"}` on the flash. **← cheapest hard sync.**
   - a **witness camera** in frame that sees the flash (align in post).
   - `POST /sync` from a shared button both sides press.
   Fire `mark()` at **start, mid, and end** to bound clock drift (linear-correct between anchors).
3. **Refine — cross-correlate motion onsets.** A logged `jump` **event** and the CSI energy
   spike are the same instant; cross-correlating them recovers residual offset per session.

---

## 5. Collection protocol (for a usable dataset)
- **Fixed rig** per session; record `room`, layout, Tx/Rx positions, lighting in the session meta.
- **≥2–3 rooms** — WiFi models overfit the *environment*; cross-room data is mandatory for a real result.
- **Multiple subjects**, varied clothing/body types (fairness + generalization).
- Cover the full move set (jump/squat/punch/lean/push-up/arms-overhead) at varied intensity — the exergame naturally drives this.
- Empty-room baseline + a "standing still" clip per subject.

---

## 6. Offline fusion → training pairs
1. Merge the session file; split `type:'pose'|'event'` (labels) vs `type:'csi'` (features).
2. Align on `t_wall` + the `sync` anchors (linear drift-correct between them).
3. **CSI sanitization** — amplitude: Hampel/median outlier removal, band-pass; **phase:
   remove CFO/SFO/packet-detection offset** (linear-fit unwrap, or conjugate-multiply across
   antennas). Phase is powerful but noisy — sanitize before use.
4. Window CSI (e.g. 100–200 ms) around each pose frame → tensor `[subcarriers × antennas × time]`.
5. Emit `(CSI window → 33-keypoint pose)` or `(CSI window → activity label)` pairs.

---

## 7. Model (brief)
- **Pose regression:** CSI tensor → CNN/LSTM/Transformer → 2D/3D keypoints, **supervised by
  the MediaPipe pose** (teacher-student / cross-modal, exactly like DensePose-from-WiFi).
- **Activity/rep classification** (RSSI-feasible fallback): CSI/RSSI window → move class + rep count.
- **Evaluate cross-subject *and* cross-environment** (leave-one-room-out) — the honest bar.

---

## 8. MVP milestone (do this first)
1. 2× ESP32 + ESP32-CSI-Tool; 1 Tx / 1 Rx; LDR taped to screen for hard sync.
2. Node POSTs CSI JSONL to `tools/collector.mjs`; app logs pose with logging enabled.
3. One room, one subject, ~20 min of the workout circuit.
4. **Prove alignment** (jump event ↔ CSI spike within <100 ms) — this is the go/no-go.
5. Train a tiny **activity classifier** (jump vs squat vs punch vs idle) from CSI. If that
   works, scale to more rooms/subjects and move to pose regression + better hardware.

**BOM (MVP): ~$12** — 2× ESP32 (~$10), 1 LDR + resistor (~$1), jumpers. Plus a laptop for the collector.

---

## 9. Risks / gotchas
- **Environment overfitting** — the #1 failure mode; collect multiple rooms early.
- **ESP32 CSI quirks** — non-null subcarrier indexing, limited packet rate, single antenna (lower pose ceiling).
- **Phase noise** — unusable raw; must sanitize (§6.3).
- **SNTP coarseness on ESP32** — lean on the LDR flash-sync, not NTP alone.
- **Privacy/ethics** — "sensing bodies via WiFi" needs IRB + explicit opt-in consent; frame as opt-in fitness sensing, no through-wall claims in study materials.
- **Scope** — this is a *new project* riding on the label rig, not a FIT-ARCADE feature.

---

## 10. Next steps in this repo
- `tools/collector.mjs` already accepts the node's `/log` + `/sync` — no app change needed to start pairing.
- When ready: add a small `tools/align.mjs` (offline: merge → sync → windowed pairs → npz/parquet). *(Not built yet — flagged for when hardware arrives.)*
- Run the **dataset novelty/prior-art check** ("exergame-labeled WiFi-CSI pose dataset") before committing to collection.
