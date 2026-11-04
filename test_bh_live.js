const { chromium } = require('playwright-core');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  // 1. Desktop Test (1280x720)
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:3000/?welcome=1', { waitUntil: 'domcontentloaded' });
  
  // Wait 1.8s for canvas animation to be running smoothly and progress bar advancing
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'bh_desktop_frame_1.png' });
  console.log('Captured bh_desktop_frame_1.png at 1.8s');

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'bh_desktop_frame_2.png' });
  console.log('Captured bh_desktop_frame_2.png at 4.3s');

  await page.close();

  // 2. Mobile Portrait Test (390x844)
  const mobilePage = await browser.newPage({ 
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });
  await mobilePage.goto('http://localhost:3000/?welcome=1', { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(2200);
  await mobilePage.screenshot({ path: 'bh_mobile_frame.png' });
  console.log('Captured bh_mobile_frame.png at 2.2s');

  await mobilePage.close();
  await browser.close();
  console.log('All captures done.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
