// Comprehensive Mobile Audit Script for Lumentia: Star Keepers
// Uses Chrome DevTools Protocol (CDP) via native Node.js WebSocket & fetch
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9333;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\user\\.gemini\\antigravity\\brain\\5638f1a9-7f94-4984-a0ff-b0d3f56c0a19";

const VIEWPORTS = [
  { name: 'Galaxy_Base_360', width: 360, height: 740, dpr: 2 },
  { name: 'iPhone_Base_375', width: 375, height: 812, dpr: 3 },
  { name: 'iPhone_Standard_390', width: 390, height: 844, dpr: 3 },
  { name: 'Galaxy_Ultra_412', width: 412, height: 915, dpr: 2.625 },
];

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { res, rej } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) rej(data.error);
          else res(data.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.id++;
      this.callbacks.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result ? res.result.value : null;
  }
}

async function runAudit() {
  console.log("=== [Lumentia Mobile Precision Audit Engine] ===");
  const userDataDir = path.join(process.env.TEMP, 'chrome-audit-' + Date.now());
  
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ]);

  await sleep(1500);

  try {
    const verRes = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    const verData = await verRes.json();
    console.log("Connected to Headless Chrome:", verData.Browser);

    const newRes = await fetch(`http://127.0.0.1:${PORT}/json/new?file:///G:/starlight-idle/index.html`, { method: 'PUT' });
    const pageData = await newRes.json();
    
    const client = new CDPClient(pageData.webSocketDebuggerUrl);
    await client.connect();
    console.log("CDP WebSocket Session Active!");

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    // Wait for initial load
    await sleep(2500);

    const auditResults = [];

    for (const vp of VIEWPORTS) {
      console.log(`\n--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}, DPR ${vp.dpr}) ---`);
      
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dpr,
        mobile: true,
        fitWindow: false
      });

      await sleep(1000);

      // 1. Audit Overflow
      const overflowInfo = await client.eval(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const app = document.getElementById('app');
          const winW = window.innerWidth;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth, app ? app.scrollWidth : 0);
          const hasOverflow = scrollW > winW;
          
          // Find any overflowing elements
          const culprits = [];
          document.querySelectorAll('*').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.right > winW + 1 || rect.left < -1) {
              culprits.push({
                tag: el.tagName,
                cls: el.className,
                id: el.id,
                right: rect.right,
                left: rect.left,
                width: rect.width
              });
            }
          });
          return { winW, scrollW, hasOverflow, culpritCount: culprits.length, culprits: culprits.slice(0, 5) };
        })()
      `);

      // 2. Audit Touch Targets
      const touchTargetAudit = await client.eval(`
        (() => {
          const targets = [];
          const interactive = document.querySelectorAll('button, a, input, select, .nav-btn, .pick, .slot, .hero-card, .btn');
          interactive.forEach(el => {
            const rect = el.getBoundingClientRect();
            // only check visible elements
            if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
              const minDim = Math.min(rect.width, rect.height);
              if (minDim < 36) {
                targets.push({
                  tag: el.tagName,
                  text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 20),
                  cls: el.className,
                  id: el.id,
                  w: Math.round(rect.width),
                  h: Math.round(rect.height)
                });
              }
            }
          });
          return { smallTargetCount: targets.length, smallTargets: targets.slice(0, 8) };
        })()
      `);

      // 3. Audit Font Sizes
      const fontAudit = await client.eval(`
        (() => {
          const smallTexts = [];
          document.querySelectorAll('*').forEach(el => {
            if (el.children.length === 0 && el.innerText && el.innerText.trim().length > 0) {
              const fs = parseFloat(window.getComputedStyle(el).fontSize);
              if (fs < 10) {
                smallTexts.push({
                  text: el.innerText.trim().slice(0, 20),
                  tag: el.tagName,
                  cls: el.className,
                  fontSize: fs
                });
              }
            }
          });
          return { smallFontCount: smallTexts.length, smallTexts: smallTexts.slice(0, 8) };
        })()
      `);

      // 4. Capture screenshot
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      const shotPath = path.join(ARTIFACT_DIR, `audit-${vp.name}.png`);
      fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

      console.log(`  ✓ Overflow: ${overflowInfo.hasOverflow ? 'FAIL (scrollW: ' + overflowInfo.scrollW + ' > winW: ' + overflowInfo.winW + ')' : 'PASS (0px overflow)'}`);
      if (overflowInfo.hasOverflow) {
        console.log(`    Culprits:`, overflowInfo.culprits);
      }
      console.log(`  ✓ Small touch targets (<36px): ${touchTargetAudit.smallTargetCount}`);
      if (touchTargetAudit.smallTargetCount > 0) {
        console.log(`    Samples:`, touchTargetAudit.smallTargets);
      }
      console.log(`  ✓ Sub-10px fonts: ${fontAudit.smallFontCount}`);
      if (fontAudit.smallFontCount > 0) {
        console.log(`    Samples:`, fontAudit.smallTexts);
      }
      console.log(`  ✓ Screenshot saved: audit-${vp.name}.png`);

      auditResults.push({
        viewport: vp,
        overflow: overflowInfo,
        touch: touchTargetAudit,
        font: fontAudit,
        screenshot: shotPath
      });
    }

    // Now test navigating each tab on standard mobile (375x812)
    console.log(`\n--- Auditing Tab Interactions & Modals on iPhone (375x812) ---`);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 3,
      mobile: true,
      fitWindow: false
    });

    // Switch to Keepers Tab (동행)
    await client.eval(`(() => { const btn = document.querySelector('[data-tab="heroes"]'); if(btn) btn.click(); })()`);
    await sleep(600);
    let tabShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, `audit-tab-keepers.png`), Buffer.from(tabShot.data, 'base64'));
    console.log("  ✓ Keepers (동행) Tab captured: audit-tab-keepers.png");

    // Switch to Summon Tab (소환)
    await client.eval(`(() => { const btn = document.querySelector('[data-tab="summon"]'); if(btn) btn.click(); })()`);
    await sleep(600);
    tabShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, `audit-tab-summon.png`), Buffer.from(tabShot.data, 'base64'));
    console.log("  ✓ Summon (소환) Tab captured: audit-tab-summon.png");

    // Open Guide Modal
    await client.eval(`(() => { const btn = document.querySelector('[data-tab="guide"]'); if(btn) btn.click(); })()`);
    await sleep(600);
    tabShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, `audit-modal-guide.png`), Buffer.from(tabShot.data, 'base64'));
    console.log("  ✓ Guide Modal captured: audit-modal-guide.png");

    // Close Modal and return to Battle Tab
    await client.eval(`(() => { 
      const closeBtn = document.querySelector('#modal-guide .btn-close'); 
      if(closeBtn) closeBtn.click();
      const bBtn = document.querySelector('[data-tab="battle"]');
      if(bBtn) bBtn.click();
    })()`);
    await sleep(500);

    // Save final audit JSON
    const reportPath = path.join(ARTIFACT_DIR, `mobile_audit_report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2));
    console.log(`\nAudit complete! Full report written to ${reportPath}`);

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    chrome.kill('SIGKILL');
  }
}

runAudit();
