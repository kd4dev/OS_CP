const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../docs/ui-redesign');
const BASE_URL = 'http://localhost:5173';
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function capture() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
  });

  console.log('Capturing desktop 1440x900 screenshots...');
  const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // 1. Overview Idle
  await page1440.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(1000);
  await page1440.screenshot({ path: path.join(OUT_DIR, 'overview-idle-1440x900.png'), fullPage: true });

  // 2. Overview Mid-Animation (trigger packet pulse)
  // Click Node 3 to trigger WRITE pulse
  await page1440.locator('text=Node 3').first().click();
  await page1440.waitForTimeout(300); // Capture packet in flight
  await page1440.screenshot({ path: path.join(OUT_DIR, 'overview-mid-animation-1440x900.png'), fullPage: true });

  // 3. Step mode open at step 3
  // Click Step Mode button
  await page1440.locator('button:has-text("Step Mode")').first().click();
  await page1440.waitForTimeout(300);
  // Jump to step 3
  await page1440.locator('button:has-text("Downgrade")').first().click();
  await page1440.waitForTimeout(500);
  await page1440.screenshot({ path: path.join(OUT_DIR, 'step-mode-step3-1440x900.png'), fullPage: true });

  // 4. Coherence View
  await page1440.goto(`${BASE_URL}/#/coherence`, { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(500);
  await page1440.screenshot({ path: path.join(OUT_DIR, 'coherence-1440x900.png'), fullPage: true });

  // 5. Synchronization View
  await page1440.goto(`${BASE_URL}/#/sync`, { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(500);
  await page1440.screenshot({ path: path.join(OUT_DIR, 'sync-1440x900.png'), fullPage: true });

  // 6. Light Theme
  await page1440.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' });
  await page1440.waitForTimeout(500);
  // Click theme toggle button
  await page1440.locator('button[aria-label="Toggle color theme"]').click();
  await page1440.waitForTimeout(500);
  await page1440.screenshot({ path: path.join(OUT_DIR, 'light-theme-1440x900.png'), fullPage: true });
  await page1440.close();

  console.log('Capturing tablet 1024x768 screenshots...');
  const page1024 = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page1024.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' });
  await page1024.waitForTimeout(500);
  await page1024.screenshot({ path: path.join(OUT_DIR, 'overview-1024x768.png'), fullPage: true });

  await page1024.goto(`${BASE_URL}/#/coherence`, { waitUntil: 'networkidle' });
  await page1024.waitForTimeout(500);
  await page1024.screenshot({ path: path.join(OUT_DIR, 'coherence-1024x768.png'), fullPage: true });

  await page1024.goto(`${BASE_URL}/#/sync`, { waitUntil: 'networkidle' });
  await page1024.waitForTimeout(500);
  await page1024.screenshot({ path: path.join(OUT_DIR, 'sync-1024x768.png'), fullPage: true });
  await page1024.close();

  console.log('Capturing mobile 390x844 screenshots...');
  const page390 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page390.goto(`${BASE_URL}/#/overview`, { waitUntil: 'networkidle' });
  await page390.waitForTimeout(500);
  await page390.screenshot({ path: path.join(OUT_DIR, 'overview-390x844.png'), fullPage: true });

  // Mobile step mode
  await page390.locator('button[aria-label="Toggle step-by-step packet tracer mode"]').click();
  await page390.waitForTimeout(300);
  await page390.screenshot({ path: path.join(OUT_DIR, 'step-mode-390x844.png'), fullPage: true });

  await page390.goto(`${BASE_URL}/#/coherence`, { waitUntil: 'networkidle' });
  await page390.waitForTimeout(500);
  await page390.screenshot({ path: path.join(OUT_DIR, 'coherence-390x844.png'), fullPage: true });

  await page390.goto(`${BASE_URL}/#/sync`, { waitUntil: 'networkidle' });
  await page390.waitForTimeout(500);
  await page390.screenshot({ path: path.join(OUT_DIR, 'sync-390x844.png'), fullPage: true });
  await page390.close();

  await browser.close();
  console.log('All screenshots captured successfully in docs/ui-redesign/');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
