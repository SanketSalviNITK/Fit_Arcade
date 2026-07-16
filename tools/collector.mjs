// tools/collector.mjs — zero-dependency collector for FIT-ARCADE research logs.
//
// Receives newline-delimited JSON (JSONL) batches POSTed by js/data-logger.js and
// appends them to ./data/session-<startTime>.jsonl. A future WiFi/CSI capture node
// can POST its OWN JSONL to the same server, so the pose-label stream and the RF
// stream share one file and one wall clock for offline time-alignment (pair on
// t_wall, or on the mark()/sync pulses).
//
// Uses only Node built-ins (node:http, node:fs, node:path) — NO npm install needed.
//
// Run:   node tools/collector.mjs [port]      (default 8787)
// Then in the app: Settings -> Research Logging -> Collector URL = http://<this-ip>:8787

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = parseInt(process.argv[2] || process.env.PORT || '8787', 10);
const DATA_DIR = path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const FILE = path.join(DATA_DIR, `session-${stamp}.jsonl`);
let records = 0;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

function readBody(req) {
    return new Promise((resolve) => {
        let b = '';
        req.on('data', (c) => { b += c; });
        req.on('end', () => resolve(b));
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

    if (req.method === 'POST' && (req.url === '/log' || req.url === '/sync')) {
        let body = await readBody(req);
        if (req.url === '/sync') {
            // A server-timestamped marker so the WiFi node and the app share an anchor.
            body = JSON.stringify({ type: 'sync', t_wall: Date.now(), source: 'collector', label: body || 'mark' }) + '\n';
        }
        if (body && !body.endsWith('\n')) body += '\n';
        if (body) {
            fs.appendFile(FILE, body, () => {});
            records += (body.match(/\n/g) || []).length;
        }
        res.writeHead(204, CORS);
        return res.end();
    }

    // Simple status page.
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, CORS));
    res.end(
        `<h1>FIT-ARCADE research collector</h1>` +
        `<p>writing: <code>${path.basename(FILE)}</code></p>` +
        `<p>records received: <b>${records}</b></p>` +
        `<p>POST JSONL to <code>/log</code>; sync markers to <code>/sync</code>.</p>`
    );
});

server.listen(PORT, () => {
    console.log(`FIT-ARCADE research collector listening on http://localhost:${PORT}`);
    console.log(`  writing -> ${FILE}`);
    console.log(`  app Settings -> Research Logging -> Collector URL:  http://<this-machine-ip>:${PORT}`);
    console.log(`  WiFi/CSI node: POST your own JSONL to  http://<this-machine-ip>:${PORT}/log`);
});
