const { test, expect } = require('@playwright/test');

function installSlowRenameMockWorker() {
  const mockWindow = /** @type {any} */ (window);
  mockWindow.__mockWorkerGeneratePayloads = [];

  function extractPromptText(prompt) {
    if (Array.isArray(prompt)) {
      return prompt
        .map((message) => (typeof message?.content === 'string' ? message.content : ''))
        .filter((content) => content.trim())
        .join('\n');
    }
    return String(prompt || '');
  }

  class BaseMockWorker {
    constructor() {
      this.listeners = new Map();
      this.timer = null;
      this.terminated = false;
    }

    addEventListener(type, handler) {
      const set = this.listeners.get(type) || new Set();
      set.add(handler);
      this.listeners.set(type, set);
    }

    removeEventListener(type, handler) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(handler);
    }

    terminate() {
      this.terminated = true;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    _emit(type, data) {
      const set = this.listeners.get(type);
      if (!set) {
        return;
      }
      for (const handler of set) {
        handler({ data });
      }
    }
  }

  class MockLlmWorker extends BaseMockWorker {
    postMessage(message) {
      if (!message || this.terminated) {
        return;
      }

      if (message.type === 'init') {
        this._emit('message', {
          type: 'status',
          payload: { message: 'Loading model...' },
        });
        this._emit('message', {
          type: 'progress',
          payload: {
            percent: 100,
            message: 'Model ready.',
            file: 'mock-model.onnx',
            status: 'done',
            loadedBytes: 100,
            totalBytes: 100,
          },
        });
        this._emit('message', {
          type: 'init-success',
          payload: {
            backend: 'wasm',
            modelId: message.payload?.modelId || 'mock/model',
          },
        });
        this._emit('message', {
          type: 'status',
          payload: { message: 'Ready (WASM)' },
        });
        return;
      }

      if (message.type === 'generate') {
        const requestId = message.payload?.requestId;
        const promptText = extractPromptText(message.payload?.prompt);
        mockWindow.__mockWorkerGeneratePayloads.push(promptText);
        const isRename = /You create concise chat titles\./i.test(promptText);
        const chunks = isRename ? ['Title ', 'candidate'] : ['Mock ', 'streamed ', 'response.'];
        const intervalMs = isRename ? 700 : 80;
        let index = 0;

        this.timer = setInterval(() => {
          if (this.terminated) {
            clearInterval(this.timer);
            this.timer = null;
            return;
          }
          if (index < chunks.length) {
            this._emit('message', {
              type: 'token',
              payload: { requestId, text: chunks[index] },
            });
            index += 1;
            return;
          }
          clearInterval(this.timer);
          this.timer = null;
          this._emit('message', {
            type: 'complete',
            payload: { requestId, text: chunks.join('') },
          });
          this._emit('message', {
            type: 'status',
            payload: { message: 'Complete (WASM)' },
          });
        }, intervalMs);
        return;
      }

      if (message.type === 'cancel') {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        this._emit('message', {
          type: 'canceled',
          payload: { requestId: message.payload?.requestId },
        });
      }
    }
  }

  mockWindow.Worker = /** @type {any} */ (
    class RoutedMockWorker {
      constructor() {
        return new MockLlmWorker();
      }
    }
  );
}

async function ensureComposerVisible(page) {
  const input = page.locator('#messageInput');
  if (await input.isVisible()) {
    return;
  }
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(input).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installSlowRenameMockWorker);
  await page.goto('/');
});

test('new conversation stays clickable while background title generation is pending', async ({
  page,
}) => {
  await ensureComposerVisible(page);
  await page.locator('#messageInput').fill('Trigger the rename flow');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message-row.model-message .response-content')).toContainText(
    'Mock streamed response.'
  );

  await page.waitForTimeout(300);
  await expect(page.locator('#newConversationBtn')).toBeEnabled();
  await page.locator('#newConversationBtn').click();

  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('#messageInput')).toBeVisible();
});

test('regenerate works on the first response even while background title generation is pending', async ({
  page,
}) => {
  await ensureComposerVisible(page);
  await page.locator('#messageInput').fill('Trigger the rename flow');
  await page.locator('#sendButton').click();
  await expect(page.locator('.message-row.model-message .response-content')).toContainText(
    'Mock streamed response.'
  );

  const regenerateButton = page.locator('.regenerate-response-btn').first();
  await page.waitForTimeout(300);
  await expect(regenerateButton).toBeEnabled();
  await regenerateButton.click();

  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Stop generating');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const payloads = Array.isArray(/** @type {any} */ (window).__mockWorkerGeneratePayloads)
          ? /** @type {any} */ (window).__mockWorkerGeneratePayloads
          : [];
        return {
          count: payloads.length,
          lastPrompt: payloads.at(-1) || '',
        };
      })
    )
    .toEqual(
      expect.objectContaining({
        count: 3,
        lastPrompt: expect.stringContaining('Trigger the rename flow'),
      })
    );
});
