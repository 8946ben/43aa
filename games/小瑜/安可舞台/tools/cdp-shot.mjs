/* 开发期视觉/交互测试工具：CDP 驱动 headless Edge
 * 用法: node tools/cdp-shot.mjs <url> <w> <h> <budgetMs> <out.png> [steps...]
 * steps: key:<Code> | shot:<name.png> | vt:<ms> | touch:<x>,<y>
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [url, w, h, budget, out, ...steps] = process.argv.slice(2);
const PORT = 9333;

const edge = spawn(EDGE, [
  '--headless', '--disable-gpu', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getPage() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('devtools not reachable');
}

const page = await getPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let mid = 0;
const pending = new Map();
const events = [];
const consoleMsgs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method) {
    events.push(m);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      consoleMsgs.push(m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown')
      consoleMsgs.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
};
function send(method, params = {}) {
  return new Promise(res => { const id = ++mid; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function waitEvent(method, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const i = events.findIndex(e => e.method === method);
    if (i >= 0) return events.splice(i, 1)[0];
    await sleep(50);
  }
  throw new Error('timeout waiting ' + method);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 600,
});
await send('Page.navigate', { url });
await waitEvent('Page.loadEventFired');
await send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: +budget });
await waitEvent('Emulation.virtualTimeBudgetExpired', 120000);

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.resolve(path.dirname(out), name), Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
}
await shot(path.basename(out));

const KEYCODES = { KeyP: 80, KeyR: 82, KeyM: 77, Escape: 27, Enter: 13, KeyD: 68, KeyF: 70, Space: 32, KeyJ: 74, KeyK: 75 };
for (const step of steps) {
  const [kind, arg] = step.split(':');
  if (kind === 'key') {
    const code = arg;
    const kc = KEYCODES[code] || 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code === 'Space' ? ' ' : code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: kc });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code, windowsVirtualKeyCode: kc });
    await sleep(120);
  } else if (kind === 'touch') {
    const [x, y] = arg.split(',').map(Number);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(120);
  } else if (kind === 'click') {
    const [x, y] = arg.split(',').map(Number);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(150);
  } else if (kind === 'vt') {
    await send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: +arg });
    await waitEvent('Emulation.virtualTimeBudgetExpired', 120000);
  } else if (kind === 'shot') {
    await shot(arg);
  }
}
console.log('console-errors:', consoleMsgs.length ? consoleMsgs : 'none');
ws.close();
edge.kill();
process.exit(0);