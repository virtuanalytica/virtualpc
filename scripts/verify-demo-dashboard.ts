import { chromium } from '@playwright/test';

const DEMO_URL = process.env.DEMO_URL || 'http://localhost:3100/demo-dashboard.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => console.log(`[page ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log('[page error]', err.message));
  await page.goto(DEMO_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'data/verify-demo-dashboard.png', fullPage: true });
  const html = await page.content();
  const hasAgentLog = await page.locator('#agent-log').textContent().catch(() => '') || '';
  const hasGlobalLog = await page.locator('#global-log').textContent().catch(() => '') || '';
  const tasksText = await page.locator('#agent-tasks').textContent().catch(() => '') || '';
  console.log('agent log preview:', hasAgentLog.slice(0, 200));
  console.log('global log preview:', hasGlobalLog.slice(0, 200));
  console.log('tasks preview:', tasksText.slice(0, 200));
  await browser.close();
})();
