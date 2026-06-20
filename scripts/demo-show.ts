import { chromium } from '@playwright/test';

const DEMO_URL = process.env.DEMO_URL || 'http://localhost:3100/demo-dashboard.html';

(async () => {
  console.log(`Launching headed browser for ${DEMO_URL} ...`);
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`[page] ${msg.type()}: ${msg.text()}`));

  try {
    await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'data/demo-screenshot-1.png', fullPage: false });

    const summarizeBtn = page.locator('#summary-btn');
    if (await summarizeBtn.isVisible().catch(() => false)) {
      console.log('Triggering AAPL summary...');
      await summarizeBtn.click();
      await page.waitForTimeout(35000);
      await page.mouse.wheel(0, -2000);
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'data/demo-screenshot-2-summary.png', fullPage: false });
    }

    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'data/demo-screenshot-3-bottom.png', fullPage: false });

    console.log('Demo is visible in the browser window. Closing in 5 seconds.');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.error('Demo show error:', e);
    await page.screenshot({ path: 'data/demo-screenshot-error.png', fullPage: false });
  } finally {
    await browser.close();
  }
})();
