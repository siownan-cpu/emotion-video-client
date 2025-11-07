
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
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'siownan@gmail.com');
    await page.fill('input[type="password"]', 'password123'); // Assuming a known password for testing
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:3000/dashboard');

    // Go to video call
    await page.click('text=Go to Video Call');
    await page.waitForURL('http://localhost:3000/video-call');

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
