const { test, expect } = require('@playwright/test');
const { installMockWorker } = require('./helpers/mock-engine');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockWorker);
  await page.goto('/');
});

async function ensureComposerVisible(page) {
  const input = page.locator('#messageInput');
  if (await input.isVisible()) {
    return;
  }
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(input).toBeVisible();
}

test('chat flow: start, send message, load model, stream response', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start a conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  const messageInput = page.locator('#messageInput');
  await messageInput.fill('Say hello');
  await page.locator('#sendButton').click();

  await expect(page.locator('#statusRegion')).toContainText('Ready (CPU)');
  await expect(page.locator('#chatTranscriptWrap')).toBeVisible();
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Stop generating');
  await expect(page.locator('.message-row.user-message')).toHaveCount(1);
  await expect(page.locator('.message-row.model-message .response-content')).toContainText('Mock streamed response.');
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Send message');
});

test('stop generating cancels in-flight stream and resets UI', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  await page.locator('#messageInput').fill('Long answer please');
  await page.locator('#sendButton').click();
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Stop generating');

  await page.locator('#sendButton').click();
  await expect(page.locator('#debugInfo')).toContainText('Generation canceled by user.');
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Send message');
});
