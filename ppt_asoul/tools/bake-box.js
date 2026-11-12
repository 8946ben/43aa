'use strict';
// 离线绿幕抠像：file:// 下运行时 getImageData 会被跨域拦截，故烘焙一次透明 PNG
const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/ben/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/assets/art/box.png');
  const dataUrl = await page.evaluate(() => {
    const im = document.querySelector('img');
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0, size, size);
    const d = g.getImageData(0, 0, size, size), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2], m = Math.max(r, b);
      if (gg > 150 && gg > r + 60 && gg > b + 60) px[i + 3] = 0;
      else if (gg > m + 30) { px[i + 3] = Math.max(0, 255 - (gg - m - 30) * 6); px[i + 1] = m + 30; }
    }
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/png');
  });
  fs.writeFileSync(path.join(ROOT, 'assets/art/box-alpha.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log('baked assets/art/box-alpha.png');
})().catch(e => { console.error(e); process.exit(1); });