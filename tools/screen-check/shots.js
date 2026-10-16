const { chromium } = require('playwright');
const screens = process.argv.slice(2).length ? process.argv.slice(2) : ['ville-home','dash-home','dash-send','dash-track','dash-history','dash-stores','dash-store','dash-checkout','dash-order','rider','riderjob','pending','apply','merchant','merchantNew','merchantPending','admin','land-dash','land-ville'];
const path = require('path'); require('fs').mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const report = [];
  for (const s of screens) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    await p.goto(`http://localhost:${process.env.PORT || 5055}/?s=` + s);
    await p.waitForTimeout(900);
    await p.screenshot({ path: path.join(__dirname, `shots/${s}.png`), fullPage: true });
    const crash = await p.locator('text=CRASH').count();
    report.push(`${s}: ${crash ? 'CRASH ' : ''}${errs.length ? errs.join(' | ') : 'ok'}`);
    await p.close();
  }
  console.log(report.join('\n')); await b.close();
})();
