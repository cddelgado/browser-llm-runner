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

test('send stays disabled until an uploaded attachment finishes processing', async ({ page }) => {
  await page.locator('#addImagesButton').click();
  await page.locator('#attachWorkWithMenuItem').click();

  await page.evaluate(async () => {
    const typedWindow = /** @type {any} */ (window);
    const source = '<html><body><main><h1>Canvas</h1><a href="/next">Next</a></main></body></html>';
    const file = new window.File([source], 'canvas.html', { type: 'text/html' });
    const encoded = new window.TextEncoder().encode(source);
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: () =>
        new Promise((resolve) => {
          typedWindow.__releaseAttachmentRead = () => resolve(encoded.buffer.slice(0));
        }),
    });
    const input = /** @type {HTMLInputElement | null} */ (
      document.getElementById('imageAttachmentInput')
    );
    if (!input) {
      throw new Error('Attachment input not found.');
    }
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  });

  await expect(page.locator('#sendButton')).toBeDisabled();
  await expect(page.locator('#statusRegionMessage')).toContainText('Preparing 1 attachment');

  await page.locator('#messageInput').fill('Count the links.');
  await page.locator('#messageInput').press('Enter');
  await expect(page.locator('.message-row.user-message')).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(() => typeof /** @type {any} */ (window).__releaseAttachmentRead === 'function')
    )
    .toBe(true);

  await page.evaluate(() => {
    const typedWindow = /** @type {any} */ (window);
    if (typeof typedWindow.__releaseAttachmentRead === 'function') {
      typedWindow.__releaseAttachmentRead();
      delete typedWindow.__releaseAttachmentRead;
    }
  });

  await expect(page.locator('.composer-attachment-card')).toContainText('canvas.html');
  await expect(page.locator('#sendButton')).toBeEnabled();
});

test('work-with html attachment only exposes workspace availability to the model', async ({
  page,
}) => {
  await page.locator('#addImagesButton').click();
  await page.locator('#attachWorkWithMenuItem').click();

  await page.evaluate(async () => {
    const file = new window.File(
      ['<html><body><main><h1>Canvas</h1><p>Hidden body text</p></main></body></html>'],
      'canvas.html',
      { type: 'text/html' }
    );
    const input = /** @type {HTMLInputElement | null} */ (
      document.getElementById('imageAttachmentInput')
    );
    if (!input) {
      throw new Error('Attachment input not found.');
    }
    const transfer = new window.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  await expect(page.locator('.composer-attachment-card')).toContainText('canvas.html');
  await page.locator('#messageInput').fill('How many links are in this html?');
  await page.locator('#sendButton').click();

  await page.locator('.message-row.user-message .message-file-toggle').click();
  const preview = page.locator('.message-row.user-message .message-file-preview-text');
  await expect(preview).toContainText('Workspace path: /workspace/canvas.html');
  await expect(preview).not.toContainText('Contents:');
  await expect(preview).not.toContainText('Hidden body text');

  const promptShape = await page.evaluate(() => {
    const payloads = Array.isArray(/** @type {any} */ (window).__mockWorkerGeneratePayloads)
      ? /** @type {any} */ (window).__mockWorkerGeneratePayloads
      : [];
    return payloads[0];
  });
  const userPrompt = promptShape.find((entry) => entry?.role === 'user');
  expect(userPrompt?.content).toContain('Workspace path: /workspace/canvas.html');
  expect(userPrompt?.content).not.toContain('Contents:');
  expect(userPrompt?.content).not.toContain('Hidden body text');
});
