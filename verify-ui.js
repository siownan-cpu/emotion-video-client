
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.fill('#room-id-input', 'test-room');
    await page.click('button:has-text("Start Call")');
    await page.waitForSelector('video[data-testid="local-video"]');
    await page.screenshot({ path: 'screenshot.png' });
    console.log('Verification successful!');
  } catch (error) {
    console.error('Verification failed:', error);
  } finally {
    await browser.close();
  }
})();
