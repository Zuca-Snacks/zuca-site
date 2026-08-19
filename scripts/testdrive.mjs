/**
 * LOCAL TEST DRIVE — walk the signup flow end to end, touching nothing real.
 *
 *   npm run testdrive
 *
 * Boots three things and wires them together:
 *
 *   1. A STUB SHEET on :4310. Stands in for the Google Apps Script. Appends one
 *      JSON line per signup to testdrive-rows.jsonl and answers the count from
 *      the file's length. It is a plain file so you can `tail -f` it and watch
 *      rows land while you click.
 *
 *   2. The REAL API on :4320 — api/waitlist.js, api/count.js, api/confirm.js as
 *      written, no test doubles. Validation, rate limits, bot checks, consent
 *      receipts and the sanitiser all run exactly as they would in production.
 *      Only the destination is fake.
 *
 *   3. VITE on :3003, with /api proxied to :4320.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 * It never reads SHEETS_WEBHOOK_URL from your environment and never accepts one
 * pointing anywhere but localhost. Standing up a test path that could be aimed
 * at the live sheet by a stale env var is the one way this could do damage, so
 * it refuses rather than trusts.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createServer as createVite } from 'vite';

// ─── The stub runs the REAL Apps Script ──────────────────────────────────────
// Not a reimplementation. server/apps-script/Code.gs is loaded into a sandbox
// with the Google globals stubbed and a sheet backed by a JSON file, so the row
// you inspect is produced by the same code that will run in Google — same
// column mapping, same formula sanitiser, same force-to-text on phone and
// postal code. A hand-written stub would show you the payload on the wire,
// which is not the same thing as the row that lands.

const SHEET = path.resolve('testdrive-sheet.json');
const CODE_GS = fs.readFileSync(path.resolve('server/apps-script/Code.gs'), 'utf8');

function loadSheet() {
  try {
    return JSON.parse(fs.readFileSync(SHEET, 'utf8'));
  } catch {
    return [['timestamp', 'email']];
  }
}

function runAppsScript(payload) {
  const grid = loadSheet();
  const widen = (row, n) => { while (row.length < n) row.push(''); };
  const sheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => Math.max(...grid.map((r) => r.length)),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues() {
          const out = [];
          for (let r = row; r < row + numRows; r++) {
            const src = grid[r - 1] || [];
            const line = [];
            for (let c = col; c < col + numCols; c++) line.push(src[c - 1] ?? '');
            out.push(line);
          }
          return out;
        },
        getValue: () => grid[row - 1]?.[col - 1] ?? '',
        setValues(vals) {
          vals.forEach((line, i) => {
            const r = row + i - 1;
            while (grid.length <= r) grid.push([]);
            widen(grid[r], col + line.length - 1);
            line.forEach((v, j) => { grid[r][col + j - 1] = v; });
          });
          return this;
        },
        setValue(v) {
          const r = row - 1;
          while (grid.length <= r) grid.push([]);
          widen(grid[r], col);
          grid[r][col - 1] = v;
          return this;
        },
        setNumberFormat: () => ({ setValue(v) { const r = row - 1; while (grid.length <= r) grid.push([]); widen(grid[r], col); grid[r][col - 1] = v; return this; }, setValues(vals) { return this; } }),
      };
    },
  };

  let out = null;
  const sandbox = {
    console: { log: () => {}, error: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => process.env.SHEETS_WEBHOOK_TOKEN }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, getSheets: () => [sheet] }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (t) => { out = JSON.parse(t); return { setMimeType: () => t }; } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    Date, JSON, String, Number, Math, Array, Object,
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE_GS, sandbox);
  sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });

  fs.writeFileSync(SHEET, JSON.stringify(grid, null, 0));
  return { result: out, grid };
}

/** The newest data row, as a header -> value object. */
export function lastRow() {
  const grid = loadSheet();
  if (grid.length < 2) return null;
  const headers = grid[0];
  return Object.fromEntries(headers.map((h, i) => [h, grid[grid.length - 1][i] ?? '']));
}

const ROWS = path.resolve('testdrive-rows.jsonl');
const STUB_PORT = Number(process.env.TESTDRIVE_STUB_PORT || 4310);
const API_PORT  = Number(process.env.TESTDRIVE_API_PORT  || 4320);
const WEB_PORT = Number(process.env.TESTDRIVE_PORT || 3010);  // 3010 = the single URL Emil is given

/** Where the counter starts, so it looks like a real list rather than an empty one. */
const SEED_COUNT = 137;

// ─── 1. Stub sheet ───────────────────────────────────────────────────────────

const countRows = () => {
  try {
    return fs.readFileSync(ROWS, 'utf8').split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
};

const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
      const grid = loadSheet();
      return res.end(JSON.stringify({ count: SEED_COUNT + Math.max(0, grid.length - 1) }));
    }

    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      return res.end(JSON.stringify({ ok: false, error: 'validation' }));
    }

    const { result, grid } = runAppsScript(payload);
    const rows = Math.max(0, grid.length - 1);

    if (payload.action === 'confirm') {
      console.log(result?.ok ? `  ✓ CONFIRMED  ${payload.email_handle}` : `  · confirm: ${result?.error}`);
      return res.end(JSON.stringify(result ?? { ok: false }));
    }
    if (result?.ok) {
      const row = lastRow();
      const filled = Object.values(row).filter((v) => v !== '' && v != null).length;
      // Append a readable copy alongside the grid, so `tail -f` is useful.
      fs.appendFileSync(ROWS, JSON.stringify(row) + '\n');
      console.log(`  ✓ ROW ${SEED_COUNT + rows}  ${row.email}  [${filled} of ${Object.keys(row).length} columns filled]`);
      return res.end(JSON.stringify({ ok: true, count: SEED_COUNT + rows }));
    }
    console.log(`  ✗ REJECTED by Apps Script — ${result?.error}`);
    res.end(JSON.stringify(result ?? { ok: false, error: 'server' }));
  });
});

// ─── 2. Real API ─────────────────────────────────────────────────────────────

process.env.NODE_ENV = 'development';
process.env.SHEETS_WEBHOOK_URL = `http://127.0.0.1:${STUB_PORT}/exec`;
process.env.SHEETS_WEBHOOK_TOKEN = 'testdrive-local-token';
process.env.EMAIL_HASH_PEPPER = 'testdrive'.repeat(8);
process.env.CONFIRM_TOKEN_SECRET = 'testdrive-confirm'.repeat(4);

if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.SHEETS_WEBHOOK_URL)) {
  throw new Error('refusing to run: webhook is not localhost');
}

const [waitlist, count, confirm] = await Promise.all([
  import('../api/waitlist.js'),
  import('../api/count.js'),
  import('../api/confirm.js'),
]);

const api = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  const handler =
    route === '/api/waitlist' ? waitlist.default
    : route === '/api/count' ? count.default
    : route === '/api/confirm' ? confirm.default
    : null;
  if (!handler) {
    res.statusCode = 404;
    return res.end('{"ok":false,"error":"not_found"}');
  }
  // Give every request its own source IP so clicking around does not trip the
  // 5/min limiter. The limiter itself is untouched and still enforced.
  req.headers['x-real-ip'] = `198.51.100.${Math.floor(Math.random() * 250)}`;
  req.headers['x-vercel-ip-country'] = process.env.TESTDRIVE_COUNTRY || 'NO';
  handler(req, res).catch((err) => {
    console.error('  ! handler threw:', err.message);
    res.statusCode = 500;
    res.end('{"ok":false,"error":"server"}');
  });
});

// ─── 3. Vite ─────────────────────────────────────────────────────────────────

/**
 * Bind, or say plainly which port and why. All three servers, not just Vite —
 * the first version handled none of them and a collision surfaced as a raw
 * EADDRINUSE stack, which tells you the port but not that another rig is
 * already running.
 */
const bind = (server, port, what) =>
  new Promise((resolve, reject) => {
    server.once('error', (err) =>
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(`${what} cannot start: port ${port} is in use, most likely by another test drive.`)
          : err
      )
    );
    server.listen(port, '127.0.0.1', resolve);
  });

try {
  await bind(stub, STUB_PORT, 'stub sheet');
  await bind(api, API_PORT, 'API');
} catch (err) {
  console.error(`\n  ${err.message}`);
  console.error('  Stop the other rig first — two of these must not share a sheet file.\n');
  process.exit(1);
}

const vite = await createVite({
  configFile: false,
  root: process.cwd(),
  plugins: [(await import('@vitejs/plugin-react')).default()],
  server: {
    port: WEB_PORT,
    // strictPort: fail loudly rather than drift to a port nobody was told about.
    //
    // Without it Vite silently increments past a busy port. This rig printed
    // "open http://localhost:3003" while actually serving on 3010, and the URL
    // in the banner had never been checked against the socket — so the one
    // number a human copies was the one number nothing verified. Same shape as
    // every other failure this week: the message and the reality diverging with
    // nothing comparing them.
    strictPort: true,
    host: true,   // bind all interfaces — Emil opens this from a phone
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false,
        /* TEST-HARNESS ONLY. api/waitlist.js allows localhost:3003 and :5173;
           a phone's LAN origin is exactly what that control exists to refuse.
           Rewritten here so the production control stays untouched. COST: the
           origin check alone is not exercised in a test drive. */
        configure: (proxy) => {
          proxy.on('proxyReq', (rq) => {
            rq.setHeader('origin', 'http://localhost:3003');
            rq.setHeader('referer', 'http://localhost:3003/');
          });
        },
      },
    },
  },
});
try {
  await vite.listen();
} catch (err) {
  console.error(`\n  Port ${WEB_PORT} is already in use — another rig is probably running.\n` +
                `  Stop it, or set TESTDRIVE_PORT to something free. Refusing to start on a\n` +
                `  different port than the one this banner would advertise.\n`);
  process.exit(1);
}

// Report the port the server actually bound, never the constant we asked for.
const boundPort = vite.httpServer?.address()?.port ?? WEB_PORT;

const region = process.env.TESTDRIVE_COUNTRY || 'NO';
console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │  ZUCA TEST DRIVE — local only, production untouched          │
  └──────────────────────────────────────────────────────────────┘

     To stop:    kill ${process.pid}
                 NOT \`pkill -f testdrive.mjs\` — that matches on the command
                 line, so it kills every copy of this script on the machine
                 regardless of directory. It has already taken out someone
                 else's rig once.

     Open        http://localhost:${boundPort}
     Sheet       ${SHEET}          (the real column grid)
     Readable    ${ROWS}   (one row per line)
     Watch them  tail -f testdrive-rows.jsonl
     Counter     starts at ${SEED_COUNT}, +1 per signup

     Simulated visitor country: ${region}  (set TESTDRIVE_COUNTRY=US to see the US consent copy)

     Writes go to a stub on :${STUB_PORT}. The live sheet is not configured
     anywhere in this process and cannot be reached from it.

     Ctrl-C to stop.  rm testdrive-*.json*  to reset the list.
`);
