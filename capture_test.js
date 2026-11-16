const { chromium } = require('/usr/local/share/bun-global/node_modules/playwright');

async function testScreens() {
  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  // 1. Desktop Test (1280x720)
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:3000/?welcome=1', { waitUntil: 'domcontentloaded' });
  
  // Wait 1.8s (Initial orbit)
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'verify_desktop_1_8s.png' });
  console.log('Saved verify_desktop_1_8s.png');

  // Wait another 3s (4.8s mark: C and Java spiraling in)
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'verify_desktop_4_8s.png' });
  console.log('Saved verify_desktop_4_8s.png');

  await page.close();

  // 2. Mobile Test (390x844)
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
  });
  await mobilePage.goto('http://localhost:3000/?welcome=1', { waitUntil: 'domcontentloaded' });

  // Wait 2.0s
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: 'verify_mobile_2_0s.png' });
  console.log('Saved verify_mobile_2_0s.png');

  // Wait another 3.5s (5.5s mark)
  await mobilePage.waitForTimeout(3500);
  await mobilePage.screenshot({ path: 'verify_mobile_5_5s.png' });
  console.log('Saved verify_mobile_5_5s.png');

  await mobilePage.close();
  await browser.close();
  console.log('All tests completed successfully!');
}

testScreens().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
