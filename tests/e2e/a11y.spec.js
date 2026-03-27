const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { installMockWorker } = require('./helpers/mock-engine');

async function expectNoCriticalA11yViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

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

test('@a11y onboarding screen has no wcag2a/2aa violations', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Start a conversation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible();
  await expectNoCriticalA11yViolations(page);
});

test('@a11y chat screen has transcript semantics and no wcag2a/2aa violations', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await ensureComposerVisible(page);

  await page.locator('#messageInput').fill('Accessibility test message');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message-row.model-message')).toHaveCount(1);

  await expect(page.locator('#statusRegion')).toHaveAttribute('role', 'status');
  await expect(page.locator('#statusRegion')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#chatTranscriptWrap')).toHaveAttribute(
    'aria-label',
    'Chat transcript'
  );
  await expect(page.locator('form.composer')).toHaveAttribute('aria-label', 'Message input');
  await expect(page.locator('#chatTranscript')).not.toHaveAttribute('aria-live', /.+/);
  await expectNoCriticalA11yViolations(page);
});

test('@a11y settings screen keyboard open/close and no wcag2a/2aa violations', async ({ page }) => {
  const settingsButton = page.getByRole('button', { name: 'Open settings' });
  await settingsButton.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/settings$/);

  await expect(page.getByRole('tabpanel', { name: 'System' })).toBeVisible();
  await expect(page.locator('#backendSelect')).toBeVisible();
  await page.getByRole('tab', { name: 'Conversation' }).click();
  await expect(page.getByLabel('Render MathML from LaTeX')).toBeVisible();
  await expectNoCriticalA11yViolations(page);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/$/);
  await expect(settingsButton).toBeFocused();
});
