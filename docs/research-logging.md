# FIT-ARCADE — Research Data Logging

A time-synchronized capture of **pose + physiology ground-truth labels** while a player
works out, so they can be paired **offline** with an **external WiFi/CSI capture node**
to build a WiFi-sensing dataset. FIT-ARCADE produces only the *labels*; the WiFi/CSI
device is separate hardware that logs its own stream.

**Off by default. Zero overhead and zero behavior change when disabled.**

## Turn it on
Settings → **RESEARCH LOGGING**:
- **Enable logging** — starts/stops with each game (opt-in).
- **Collector URL** (optional) — live-stream to the Node collector, e.g. `http://192.168.1.50:8787`. Leave blank to keep everything in-browser.
- **Download log (.jsonl)** — save the current in-memory buffer.

## JSONL schema
One JSON object per line (`js/data-logger.js`). All records carry:
- `t_mono` — `performance.now()` ms (monotonic, best for *within-device* deltas).
- `t_wall` — `Date.now()` ms epoch (wall clock, best for *cross-device* pairing).
- `type` — `"pose" | "event" | "sync"`.

**`pose`** (≈ camera framerate, ~30 Hz):
| field | meaning |
|---|---|
| `game` | active game id (e.g. `phaser-rooftop-demo.html`) |
| `lm` | up to 33 MediaPipe landmarks `[[x,y,z,visibility], …]`, normalized 0–1, 4 dp |
| `posture` | only the posture flags currently `true` (e.g. `{isJumping:true}`) |
| `hr` | rPPG heart rate (bpm; 0 until confident) |
| `hrConf` | rPPG confidence 0–1 |
| `effort` | fused effort 0–1 |
| `reps` | session rep count so far |

**`event`** (on each discrete motion): `name` (`jump`/`squat`/`punchLeft`/…), `reps`.

**`sync`**: `label` (`session-start` / `session-end` / custom) plus, on start, `meta`.

## Time-sync protocol (pairing pose ↔ WiFi)
1. **Preferred:** run **NTP on both machines**, then pair on `t_wall`.
2. **Backup (no NTP):** call `DataLogger.mark('sync')` in the console — it writes a
   `sync` record **and flashes the screen white for ~120 ms**. The WiFi node (and/or a
   witness camera) sees the flash; align the two streams on that pulse. Repeat at
   start and end to bound clock drift.
3. Pose is ~30 Hz; CSI can be 100s Hz — aim for **sub-100 ms** alignment.

## Run the collector (optional live stream)
```bash
node tools/collector.mjs          # default port 8787
```
Zero dependencies (Node built-ins only). It appends every POSTed batch to
`./data/session-<time>.jsonl`. Set the app's Collector URL to
`http://<this-machine-ip>:8787`. The browser POSTs `text/plain` JSONL (a CORS
"simple request", no preflight).

## Pairing the WiFi / CSI node
The capture node (e.g. **ESP32-CSI-Tool**, **Nexmon CSI** on a Raspberry Pi, or an
Intel 5300 laptop) should **POST its own JSONL** to the same collector:
```
POST http://<collector-ip>:8787/log
{"t_wall":<epoch ms>,"type":"csi","rssi":-51,"csi":[...],"dev":"esp32-a"}
```
Both streams land in one file, sharing one wall clock. Align on `t_wall` (or the
`sync` pulses), then use the app's `pose`/`posture` records as the training labels
for the RF signal. `POST /sync` writes a server-timestamped marker both sides can
key off.

> **Note:** RSSI is a single coarse scalar — good for gross activity/rep classification.
> Fine-grained *pose* estimation needs **CSI** (amplitude+phase across subcarriers).
> See the project discussion for the RSSI-vs-CSI tradeoff.

## Test without a camera
Pose only runs with a real webcam. To exercise the pipeline headless:
```js
// in the browser console (logging enabled, a game launched or DataLogger.start({game:'test'})):
rppgEstimator.simulate(140);        // drive HR
motionBus.debugFire('jump');        // emit discrete events
DataLogger.buffer.length;           // records captured
DataLogger.toJSONL();               // inspect
DataLogger.download();              // save
```
