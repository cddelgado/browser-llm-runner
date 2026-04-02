const { test, expect } = require('@playwright/test');
const { installMockWorker } = require('./helpers/mock-engine');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockWorker);
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.locator('#messageInput')).toBeVisible();
});

test('attachment menu shows reference and work-with options', async ({
  page,
}) => {
  await page.locator('#addImagesButton').click();
  await expect(page.locator('#attachReferenceMenuItem')).toBeVisible();
  await expect(page.locator('#attachWorkWithMenuItem')).toBeVisible();
});

test('pdf attachment is added to the prompt and transcript', async ({ page }) => {
  await page.evaluate(async () => {
    const binary = window.atob(
      'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAzMDAgMTQ0XSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA2NyA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjcyIDEwMCBUZAooSGVsbG8gUERGIGF0dGFjaG1lbnQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDYwIDAwMDAwIG4gCjAwMDAwMDAxMTcgMDAwMDAgbiAKMDAwMDAwMDI0MyAwMDAwMCBuIAowMDAwMDAwMzYwIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgL1NpemUgNiA+PgpzdGFydHhyZWYKNDE4CiUlRU9G'
    );
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const file = new window.File([bytes], 'lesson.pdf', { type: 'application/pdf' });
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('imageAttachmentInput'));
    if (!input) {
      throw new Error('Attachment input not found.');
    }
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  await expect(page.locator('.composer-attachment-card')).toHaveCount(1);
  await expect(page.locator('.composer-attachment-card')).toContainText('lesson.pdf');
  await expect(page.locator('#statusRegionMessage')).toContainText('1 file attached.');

  await page.locator('#messageInput').fill('Summarize the document.');
  await page.locator('#sendButton').click();

  await expect(page.locator('.message-row.user-message .message-file-card')).toContainText('lesson.pdf');
  await page
    .locator('.message-row.user-message .message-file-toggle')
    .click();
  await expect(page.locator('.message-row.user-message .message-file-preview-text')).toContainText(
    'Attached PDF: lesson.pdf'
  );
  await expect(page.locator('.message-row.user-message .message-file-preview-text')).toContainText(
    'Workspace path: /workspace/lesson.pdf'
  );
  await expect(page.locator('.message-row.user-message .message-file-preview-text')).toContainText(
    'Mock extracted PDF text.'
  );

  const promptShape = await page.evaluate(() => {
    const payloads = Array.isArray(/** @type {any} */ (window).__mockWorkerGeneratePayloads)
      ? /** @type {any} */ (window).__mockWorkerGeneratePayloads
      : [];
    return payloads[0];
  });
  const userPrompt = promptShape.find((entry) => entry?.role === 'user');
  expect(promptShape).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Attached PDF: lesson.pdf'),
      }),
    ]),
  );
  expect(userPrompt?.content).toContain('Workspace path: /workspace/lesson.pdf');
  expect(userPrompt?.content).toContain('Mock extracted PDF text.');
});
