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

  await expect(page.locator('#chatTranscriptWrap')).toBeVisible();
  await expect(page.locator('.message-row.user-message')).toHaveCount(1);
  await expect(page.locator('.message-row.model-message .response-content')).toContainText(
    'Mock streamed response.'
  );
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Send message');

  const promptShape = await page.evaluate(() => {
    const payloads = Array.isArray(/** @type {any} */ (window).__mockWorkerGeneratePayloads)
      ? /** @type {any} */ (window).__mockWorkerGeneratePayloads
      : [];
    const firstPrompt = payloads[0];
    return {
      isArray: Array.isArray(firstPrompt),
      roles: Array.isArray(firstPrompt) ? firstPrompt.map((entry) => entry?.role) : [],
      contents: Array.isArray(firstPrompt) ? firstPrompt.map((entry) => entry?.content) : [],
    };
  });
  expect(promptShape.isArray).toBe(true);
  expect(promptShape.roles).toContain('user');
  expect(promptShape.contents).toContain('Say hello');
});

test('conversation panel can collapse and expand from the panel border', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  const toggleButton = page.locator('#conversationPanelCollapseButton');
  await expect(toggleButton).toBeVisible();
  await expect(toggleButton).toHaveAttribute('aria-label', 'Collapse conversations panel');
  await toggleButton.click();

  await expect(page.locator('body')).toHaveClass(/conversation-panel-collapsed/);
  await expect(toggleButton).toHaveAttribute('aria-label', 'Expand conversations panel');

  await toggleButton.click();
  await expect(page.locator('body')).not.toHaveClass(/conversation-panel-collapsed/);
});

test('transcript step buttons stay clear of the scrollbar gutter', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  await page.locator('#messageInput').fill('Show the transcript controls');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message-row.model-message')).toHaveCount(1);

  const nav = page.locator('.transcript-step-nav');
  await expect(nav).toBeVisible();
  const navBox = await nav.boundingBox();
  expect(navBox).not.toBeNull();

  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect((navBox?.x ?? 0) + (navBox?.width ?? 0)).toBeLessThanOrEqual(clientWidth - 4);
});

test('keyboard shortcuts open shortcut help, send, and open settings', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open keyboard shortcuts' })).toBeVisible();

  await page.keyboard.down('Control');
  await page.keyboard.press('/');
  await page.keyboard.up('Control');
  const shortcutsDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(shortcutsDialog).toBeVisible();
  await shortcutsDialog.getByRole('button', { name: 'Close keyboard shortcuts' }).click();
  await expect(shortcutsDialog).toBeHidden();

  await page.keyboard.down('Alt');
  await page.keyboard.press('n');
  await page.keyboard.up('Alt');
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  await page.locator('#messageInput').fill('Shortcut send');
  await page.keyboard.press('Enter');
  await expect(page.locator('.message-row.model-message .response-content')).toContainText(
    'Mock streamed response.'
  );

  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        altKey: true,
        bubbles: true,
      })
    );
  });
  await expect(page).toHaveURL(/#\/settings$/);
});

test('composer uses Enter to send and Shift+Enter for a new line', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  const messageInput = page.locator('#messageInput');
  await messageInput.fill('Line one');
  await messageInput.press('Shift+Enter');
  await messageInput.type('Line two');
  await expect(messageInput).toHaveValue('Line one\nLine two');

  await messageInput.press('Enter');
  await expect(page.locator('.message-row.user-message')).toHaveCount(1);
  await expect(page.locator('.message-row.user-message')).toContainText('Line one');
  await expect(page.locator('.message-row.user-message')).toContainText('Line two');
  await expect(page.locator('.message-row.model-message .response-content')).toContainText(
    'Mock streamed response.'
  );
});

test('stop generating cancels in-flight stream and resets UI', async ({ page }) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  await page.locator('#messageInput').fill('Long answer please');
  await page.locator('#sendButton').click();
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Stop generating');
  await expect(page.locator('#sendButton')).toHaveClass(/is-stop-mode/);

  await page.locator('#sendButton').click();
  await expect(page.locator('#debugInfo')).toContainText('Generation canceled by user.');
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Send message');
});
