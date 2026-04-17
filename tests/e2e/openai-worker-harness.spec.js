const { test, expect } = require('@playwright/test');

test('browser harness exercises the real openai-compatible worker path', async ({ page }) => {
  await page.route('https://example.test/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body:
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
        'data: [DONE]\n\n',
    });
  });

  await page.goto('./worker-harness.html');
  await page.getByRole('button', { name: 'Run worker harness' }).click();

  await expect(page.locator('#workerOutput')).toHaveText('Hello world');
  await expect(page.locator('#workerStatus')).toHaveText('Complete');
  await expect(page.locator('#workerEvents')).toContainText('token: Hello ');
  await expect(page.locator('#workerEvents')).toContainText('token: world');
});

test('browser harness cancels the real openai-compatible worker request', async ({ page }) => {
  let requestStarted;
  const requestStartedPromise = new Promise((resolve) => {
    requestStarted = resolve;
  });

  await page.route('https://example.test/v1/chat/completions', async (route) => {
    requestStarted();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          'data: {"choices":[{"delta":{"content":"Too late"}}]}\n\n' + 'data: [DONE]\n\n',
      });
    } catch {
      // Cancellation can abort the intercepted request before the delayed response is sent.
    }
  });

  await page.goto('./worker-harness.html');
  await page.getByRole('button', { name: 'Run worker harness' }).click();
  await requestStartedPromise;
  await page.getByRole('button', { name: 'Cancel worker harness' }).click();

  await expect(page.locator('#workerStatus')).toHaveText('Canceled');
  await expect(page.locator('#workerEvents')).toContainText('canceled');
  await expect(page.locator('#workerOutput')).toHaveText('');
});
