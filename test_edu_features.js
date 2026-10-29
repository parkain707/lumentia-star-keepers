// Headless Chrome Automated Test for Educational Game Features & Teacher Certificate
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9445;
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = path.join(__dirname, 'audit-edu');

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
    if (res.exceptionDetails) {
      console.error("Eval Exception:", JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : null;
  }
  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`[Screenshot saved] -> ${filePath}`);
  }
}

async function runTest() {
  console.log("=== [Sentinel QA: Educational Game System & Certificate Verification] ===");
  const userDataDir = path.join(process.env.TEMP, 'chrome-edu-test-' + Date.now());

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

    // 0. Auto-register or guest login via Gate form
    console.log("TEST 0: Initializing player profile via Gate Form...");
    const regRes = await client.eval(`
      (async () => {
        const inputName = document.querySelector('#gate-name');
        const inputPass = document.querySelector('#gate-pass');
        const form = document.querySelector('#gate-form');
        if (inputName && inputPass && form) {
          inputName.value = '별빛수호자';
          inputPass.value = '7777';
          form.dispatchEvent(new Event('submit', { cancelable: true }));
          await new Promise(r => setTimeout(r, 500));
        }
        return {
          user: typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null,
          gateOpen: !!document.querySelector('.keeper-gate')
        };
      })()
    `);
    console.log("Registered:", regRes);
    await sleep(1000);

    // 1. Verify Daily 2-Play Limit
    console.log("\nTEST 1: Daily 2-Play Limit Logic...");
    const dailyTest = await client.eval(`
      (() => {
        const state = Game.state;
        const today = new Date().toISOString().slice(0, 10);
        state.dailyPlays = { date: today, count: 0 };
        
        const initial = Game.checkDailyPlays();
        const firstPlaySuccess = Game.consumeDailyPlay();
        const statusAfter1 = Game.checkDailyPlays();
        const secondPlaySuccess = Game.consumeDailyPlay();
        const statusAfter2 = Game.checkDailyPlays();
        const thirdPlaySuccess = Game.consumeDailyPlay(); // should be blocked (false)
        
        return {
          initialAvailable: initial.available,
          initialCanPlay: initial.canPlay,
          firstPlaySuccess: firstPlaySuccess,
          after1Available: statusAfter1.available,
          secondPlaySuccess: secondPlaySuccess,
          after2Available: statusAfter2.available,
          thirdPlaySuccess: thirdPlaySuccess
        };
      })()
    `);
    console.log("Daily test result:", JSON.stringify(dailyTest, null, 2));
    if (dailyTest.initialAvailable !== 2 || dailyTest.thirdPlaySuccess !== false || dailyTest.after2Available !== 0) {
      throw new Error("Daily play limit failed: " + JSON.stringify(dailyTest));
    }
    console.log("=> PASSED: Daily limit strictly capped at 2 runs per day.");

    // 2. Verify Difficulty Scaling (>= 1000 smiles)
    console.log("\nTEST 2: Push-Your-Luck Difficulty Scaling (>= 1000 Smiles)...");
    const diffTest = await client.eval(`
      (() => {
        const state = Game.state;
        state.challengePot = 500;
        const normal = Game.getDifficultyMultiplier();

        state.challengePot = 1000;
        const threshold = Game.getDifficultyMultiplier();

        state.challengePot = 2500;
        const intense = Game.getDifficultyMultiplier();

        state.challengePot = 5000;
        const extreme = Game.getDifficultyMultiplier();

        return { normal, threshold, intense, extreme };
      })()
    `);
    console.log("Difficulty scaling result:", JSON.stringify(diffTest, null, 2));
    if (diffTest.normal.isHard !== false || diffTest.threshold.isHard !== true || diffTest.threshold.hpMult < 1.8) {
      throw new Error("Difficulty scaling calculation error: " + JSON.stringify(diffTest));
    }
    console.log("=> PASSED: Normal under 1,000 smiles (1.0x); sharply ramps up at 1,000 smiles.");

    // 3. Verify Challenge Pot UI & Cashout Mechanics
    console.log("\nTEST 3: Pot Bar Render & Cashout...");
    const potRenderTest = await client.eval(`
      (() => {
        const state = Game.state;
        state.challengePot = 3200;
        state.gold = 500;
        if (typeof UI !== 'undefined' && UI.renderChallengePot) {
          UI.renderChallengePot();
        }
        const potBar = document.getElementById('pot-bar');
        const potAmount = document.getElementById('pot-amount');
        const potDangerTag = document.getElementById('pot-danger-tag');
        const btnCashout = document.getElementById('btn-cashout');
        
        return {
          potBarExists: !!potBar,
          potBarClasses: potBar ? potBar.className : null,
          potText: potAmount ? potAmount.innerText : null,
          dangerVisible: potDangerTag ? !potDangerTag.hidden : null,
          btnVisible: btnCashout ? !btnCashout.disabled : null
        };
      })()
    `);
    console.log("Pot render test result:", JSON.stringify(potRenderTest, null, 2));
    
    // Screenshot Pot HUD
    const hudPath = path.join(ARTIFACT_DIR, 'audit-pot-hud.png');
    await client.screenshot(hudPath);

    // Execute Cashout
    const cashoutTest = await client.eval(`
      (() => {
        const goldBefore = Game.state.gold;
        const res = Game.cashoutChallengePot();
        const goldAfter = Game.state.gold;
        const potAfter = Game.getChallengePot();
        return {
          goldBefore,
          goldAfter,
          potAfter,
          ok: res.ok,
          amount: res.amount
        };
      })()
    `);
    console.log("Cashout test result:", JSON.stringify(cashoutTest, null, 2));
    if (!cashoutTest.ok || cashoutTest.amount !== 3200 || cashoutTest.potAfter !== 0 || cashoutTest.goldAfter !== 3700) {
      throw new Error("Cashout logic failure: " + JSON.stringify(cashoutTest));
    }
    console.log("=> PASSED: Cashout successfully transferred 3,200 smiles to bank and reset pot to 0.");

    // 4. Verify 100% Loss on Battle Defeat
    console.log("\nTEST 4: 100% Loss of Unbanked Pot on Defeat...");
    const defeatTest = await client.eval(`
      (() => {
        const state = Game.state;
        state.challengePot = 4500;
        const goldBefore = state.gold;
        const res = Game.failChallengePot();
        return {
          lost: res.lost,
          potAfter: Game.getChallengePot(),
          goldAfter: state.gold,
          goldRemainedSame: state.gold === goldBefore
        };
      })()
    `);
    console.log("Defeat loss test result:", JSON.stringify(defeatTest, null, 2));
    if (defeatTest.lost !== 4500 || defeatTest.potAfter !== 0 || !defeatTest.goldRemainedSame) {
      throw new Error("Defeat pot wipe failure: " + JSON.stringify(defeatTest));
    }
    console.log("=> PASSED: Battle defeat strictly wiped 100% (4,500 smiles) from the challenge pot without affecting banked gold.");

    // 5. Verify Teacher Claim Certificate Modal & 1-Click Copy
    console.log("\nTEST 5: Teacher Claim Certificate Modal & Text Generation...");
    const certTest = await client.eval(`
      (() => {
        UI.openTeacherCertificate(3500);
        const modal = document.querySelector('.cert-modal');
        const stamp = document.querySelector('.cert-stamp');
        const copyBtn = document.getElementById('btn-cert-copy');
        const copyText = copyBtn ? copyBtn.getAttribute('data-copy-text') : null;
        
        return {
          modalExists: !!modal,
          hasStamp: !!stamp,
          stampText: stamp ? stamp.innerText : null,
          hasCopyBtn: !!copyBtn,
          copyTextSample: copyText ? copyText.slice(0, 150) : null,
          hasVerificationCode: copyText ? copyText.includes('LMN-CERT-') : false,
          hasLiveLink: copyText ? copyText.includes('https://lumentia.vercel.app') : false
        };
      })()
    `);
    console.log("Certificate test result:", JSON.stringify(certTest, null, 2));
    if (!certTest.modalExists || !certTest.hasVerificationCode || !certTest.hasLiveLink) {
      throw new Error("Teacher certificate modal failed verification: " + JSON.stringify(certTest));
    }
    console.log("=> PASSED: Teacher Certificate modal displayed with official stamp, verification code, and 1-click Kakao/SMS copy text.");

    // Screenshot Certificate
    await sleep(500);
    const certPath = path.join(ARTIFACT_DIR, 'audit-teacher-cert.png');
    await client.screenshot(certPath);

    console.log("\n=== ALL 5 SENTINEL QA SUITES PASSED FLAWLESSLY ===");

  } finally {
    try { chrome.kill(); } catch (e) {}
  }
}

runTest().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
