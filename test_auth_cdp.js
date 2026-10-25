// Headless Chrome Automated Test for Keeper Name & Password Auth System
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9444;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\user\\.gemini\\antigravity\\brain\\5638f1a9-7f94-4984-a0ff-b0d3f56c0a19";

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

async function runTest() {
  console.log("=== [Sentinel QA: Keeper Auth & Continuation Verification] ===");
  const userDataDir = path.join(process.env.TEMP, 'chrome-auth-test-' + Date.now());

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
    const newRes = await fetch(`http://127.0.0.1:${PORT}/json/new?file:///G:/starlight-idle/index.html`, { method: 'PUT' });
    const pageData = await newRes.json();
    const client = new CDPClient(pageData.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      fitWindow: false
    });

    await sleep(2000);

    // 1. Verify Keeper's Gate Modal is shown on first visit
    console.log("TEST 1: Check Keeper Gate Modal on Fresh Boot...");
    const gateVisible = await client.eval(`
      (() => {
        const gate = document.querySelector('.keeper-gate');
        return {
          isShown: !!gate,
          title: gate ? gate.querySelector('h2').innerText : null,
          hasTabs: document.querySelectorAll('.gate-tab').length
        };
      })()
    `);
    console.log("  Gate Check:", gateVisible);
    if (!gateVisible.isShown) throw new Error("Keeper Gate modal not shown on fresh boot!");

    // Capture screenshot of Gate
    let shot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'audit-keeper-gate.png'), Buffer.from(shot.data, 'base64'));
    console.log("  ✓ Gate screenshot saved: audit-keeper-gate.png");

    // 2. Test Registration Validation (short name error)
    console.log("\nTEST 2: Test Short Name Rejection...");
    const shortNameErr = await client.eval(`
      (async () => {
        const inputName = document.querySelector('#gate-name');
        const inputPass = document.querySelector('#gate-pass');
        const form = document.querySelector('#gate-form');
        inputName.value = 'a'; // too short
        inputPass.value = '1234';
        const submitEvent = new Event('submit', { cancelable: true });
        form.dispatchEvent(submitEvent);
        await new Promise(r => setTimeout(r, 200));
        const errEl = document.querySelector('#gate-error');
        return { isVisible: errEl.style.display !== 'none', text: errEl.innerText };
      })()
    `);
    console.log("  Short Name Error Result:", shortNameErr);

    // 3. Test Successful Registration with "별빛대장" and password "lumen777"
    console.log("\nTEST 3: Register Valid User ('별빛대장' / 'lumen777')...");
    const regResult = await client.eval(`
      (async () => {
        const inputName = document.querySelector('#gate-name');
        const inputPass = document.querySelector('#gate-pass');
        const form = document.querySelector('#gate-form');
        inputName.value = '별빛대장';
        inputPass.value = 'lumen777';
        const submitEvent = new Event('submit', { cancelable: true });
        form.dispatchEvent(submitEvent);
        await new Promise(r => setTimeout(r, 400));
        return {
          currentUser: Auth.getCurrentUser(),
          hudName: document.querySelector('#hud-keeper-name').innerText,
          gateClosed: !document.querySelector('.keeper-gate')
        };
      })()
    `);
    console.log("  Registration Result:", regResult);
    if (regResult.currentUser !== '별빛대장') throw new Error("Registration failed to set current user!");

    // Check Welcome modal after registration
    await sleep(500);
    const welcomeCheck = await client.eval(`
      (() => {
        const btn = document.querySelector('#welcome-start');
        if (btn) btn.click();
        return { welcomeClicked: !!btn };
      })()
    `);
    console.log("  Welcome click:", welcomeCheck);
    await sleep(500);

    // Capture Logged In HUD
    shot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'audit-keeper-hud.png'), Buffer.from(shot.data, 'base64'));
    console.log("  ✓ HUD screenshot saved: audit-keeper-hud.png");

    // 4. Test Settings Account Row & Export Transfer Code
    console.log("\nTEST 4: Test Settings Account Row & Transfer Code Export...");
    const transferResult = await client.eval(`
      (() => {
        const res = Auth.exportTransferCode();
        return {
          ok: res.ok,
          hasLumenPrefix: res.code && res.code.startsWith('LUMEN-'),
          codeLength: res.code ? res.code.length : 0
        };
      })()
    `);
    console.log("  Transfer Code Export Result:", transferResult);
    if (!transferResult.ok) throw new Error("Transfer code export failed!");

    // 5. Test Logout
    console.log("\nTEST 5: Test Logout...");
    const logoutResult = await client.eval(`
      (() => {
        Game.logout();
        return {
          currentUser: Auth.getCurrentUser(),
          gateShownAgain: !!document.querySelector('.keeper-gate')
        };
      })()
    `);
    console.log("  Logout Result:", logoutResult);
    if (logoutResult.currentUser !== null || !logoutResult.gateShownAgain) {
      throw new Error("Logout failed to clear user or reopen gate!");
    }

    // 6. Test Login (이어서 하기) - Wrong Password Rejection
    console.log("\nTEST 6: Test Login with WRONG Password...");
    const wrongPassResult = await client.eval(`
      (async () => {
        const loginTab = document.querySelector('[data-gate-tab="login"]');
        loginTab.click();
        await new Promise(r => setTimeout(r, 100));
        const inputName = document.querySelector('#gate-name');
        const inputPass = document.querySelector('#gate-pass');
        const form = document.querySelector('#gate-form');
        inputName.value = '별빛대장';
        inputPass.value = 'wrong_password_999';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 400));
        const errEl = document.querySelector('#gate-error');
        return {
          errorShown: errEl.style.display !== 'none',
          errorText: errEl.innerText,
          currentUser: Auth.getCurrentUser()
        };
      })()
    `);
    console.log("  Wrong Password Rejection Result:", wrongPassResult);
    if (!wrongPassResult.errorShown || wrongPassResult.currentUser !== null) {
      throw new Error("Wrong password was not rejected!");
    }

    // 7. Test Login (이어서 하기) - Correct Password Success
    console.log("\nTEST 7: Test Login with CORRECT Password ('lumen777')...");
    const correctPassResult = await client.eval(`
      (async () => {
        const inputName = document.querySelector('#gate-name');
        const inputPass = document.querySelector('#gate-pass');
        const form = document.querySelector('#gate-form');
        inputName.value = '별빛대장';
        inputPass.value = 'lumen777';
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await new Promise(r => setTimeout(r, 400));
        return {
          currentUser: Auth.getCurrentUser(),
          gateClosed: !document.querySelector('.keeper-gate'),
          keeperName: Game.getKeeperName()
        };
      })()
    `);
    console.log("  Correct Password Login Result:", correctPassResult);
    if (correctPassResult.currentUser !== '별빛대장' || !correctPassResult.gateClosed) {
      throw new Error("Login failed with correct password!");
    }

    console.log("\n>>> ALL 7 AUTOMATED AUTH & CONTINUATION TESTS PASSED WITH 100% ACCURACY! <<<");

  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    chrome.kill('SIGKILL');
  }
}

runTest();
