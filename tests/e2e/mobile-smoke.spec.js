const { test, expect } = require('@playwright/test');
const { installMockWorker } = require('./helpers/mock-engine');

const MOBILE_TERMINAL_CONVERSATION_ID = 'conversation-mobile-terminal';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockWorker);
  await page.goto('./');
});

async function startConversation(page) {
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('#messageInput')).toBeVisible();
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBe(metrics.clientWidth);
}

async function assertNoFooterComposerOverlap(page) {
  const hasOverlap = await page.evaluate(() => {
    const composer = document.querySelector('form.composer');
    if (!(composer instanceof HTMLElement)) {
      return false;
    }
    const composerRect = composer.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.app-footer'))
      .filter((footer) => footer instanceof HTMLElement)
      .some((footer) => {
        const style = window.getComputedStyle(footer);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }
        const rect = footer.getBoundingClientRect();
        return rect.top < composerRect.bottom - 2 && rect.bottom > composerRect.top + 2;
      });
  });
  expect(hasOverlap).toBe(false);
}

async function seedTerminalConversation(page) {
  await page.evaluate(async (conversationId) => {
    const DB_NAME = 'browser-llm-runner-db';
    const DB_VERSION = 2;
    const ROOT_STORE_NAME = 'conversationRoots';
    const CONVERSATION_STORE_NAME = 'conversations';
    const MESSAGE_STORE_NAME = 'messages';
    const ARTIFACT_STORE_NAME = 'artifacts';
    const ROOT_KEY = 'conversations.v2';

    const openDb = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(ROOT_STORE_NAME)) {
            db.createObjectStore(ROOT_STORE_NAME, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(CONVERSATION_STORE_NAME)) {
            db.createObjectStore(CONVERSATION_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(MESSAGE_STORE_NAME)) {
            db.createObjectStore(MESSAGE_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(ARTIFACT_STORE_NAME)) {
            db.createObjectStore(ARTIFACT_STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
      });

    const waitForTransaction = (transaction) =>
      new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error || new Error('IndexedDB transaction failed.'));
        transaction.onabort = () =>
          reject(transaction.error || new Error('IndexedDB transaction aborted.'));
      });

    const db = await openDb();
    const timestamp = Date.now();
    const transaction = db.transaction(
      [ROOT_STORE_NAME, CONVERSATION_STORE_NAME, MESSAGE_STORE_NAME, ARTIFACT_STORE_NAME],
      'readwrite'
    );
    transaction.objectStore(ROOT_STORE_NAME).clear();
    transaction.objectStore(CONVERSATION_STORE_NAME).clear();
    transaction.objectStore(MESSAGE_STORE_NAME).clear();
    transaction.objectStore(ARTIFACT_STORE_NAME).clear();

    transaction.objectStore(ROOT_STORE_NAME).put({
      key: ROOT_KEY,
      schemaVersion: 2,
      savedAt: timestamp,
      activeConversationId: conversationId,
      conversationCount: 1,
      conversationIdCounter: 1,
    });

    transaction.objectStore(CONVERSATION_STORE_NAME).put({
      id: conversationId,
      sortOrder: 0,
      name: 'Terminal session',
      modelId: 'huggingworld/gemma-4-E2B-it-ONNX',
      conversationType: 'chat',
      systemPrompt: null,
      conversationSystemPrompt: null,
      appendConversationSystemPrompt: true,
      languagePreference: null,
      thinkingEnabled: null,
      agent: null,
      startedAt: timestamp,
      hasGeneratedName: true,
      currentWorkingDirectory: '/workspace',
      shellVariables: {},
      activeLeafMessageId: 'message-2',
      lastSpokenLeafMessageId: 'message-2',
      messageNodeCounter: 2,
    });

    transaction.objectStore(MESSAGE_STORE_NAME).put({
      id: 'message-1',
      conversationId,
      sortOrder: 0,
      role: 'user',
      speaker: 'User',
      text: 'Run pwd',
      createdAt: timestamp,
      parentId: null,
      childIds: ['message-2'],
      thoughts: '',
      response: '',
      hasThinking: false,
      isThinkingComplete: true,
      isResponseComplete: true,
      toolCalls: [],
      toolResult: '',
      isToolResultComplete: true,
      content: {
        parts: [],
        llmRepresentation: null,
      },
      artifactRefs: [],
    });

    const toolResultData = {
      command: 'pwd',
      currentWorkingDirectory: '/workspace',
      exitCode: 0,
      stdout: '/workspace',
      stderr: '',
    };
    transaction.objectStore(MESSAGE_STORE_NAME).put({
      id: 'message-2',
      conversationId,
      sortOrder: 1,
      role: 'tool',
      speaker: 'Tool',
      text: '',
      createdAt: timestamp + 1,
      parentId: 'message-1',
      childIds: [],
      thoughts: '',
      response: '',
      hasThinking: false,
      isThinkingComplete: true,
      isResponseComplete: true,
      toolName: 'run_shell_command',
      toolArguments: { shell: 'pwd' },
      toolResultData,
      toolResult: JSON.stringify(toolResultData),
      isToolResultComplete: true,
      content: {
        parts: [],
        llmRepresentation: null,
      },
      artifactRefs: [],
    });

    await waitForTransaction(transaction);
    db.close();
  }, MOBILE_TERMINAL_CONVERSATION_ID);
}

test('mobile chat flow keeps the layout clear and stop-generation reachable', async ({ page }) => {
  await assertNoHorizontalOverflow(page);
  await startConversation(page);
  await assertNoHorizontalOverflow(page);

  const preChatSpacing = await page.evaluate(() => {
    const chatMain = document.querySelector('.chat-main');
    const preChatPanel = document.getElementById('preChatPanel');
    if (!(chatMain instanceof HTMLElement) || !(preChatPanel instanceof HTMLElement)) {
      return null;
    }
    return (
      preChatPanel.getBoundingClientRect().top - chatMain.getBoundingClientRect().top
    );
  });
  expect(preChatSpacing).not.toBeNull();
  expect(preChatSpacing).toBeLessThan(48);
  await assertNoFooterComposerOverlap(page);

  await page.locator('#messageInput').fill('Long answer please');
  await page.locator('#sendButton').click();
  await expect(page).toHaveURL(/#\/chat\/[0-9a-f-]+$/);
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Stop generating');

  const layout = await page.evaluate(() => {
    const nav = document.querySelector('.transcript-step-nav');
    const composer = document.querySelector('form.composer');
    if (!(nav instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
      return null;
    }
    const navRect = nav.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    return {
      navLeft: navRect.left,
      navRight: navRect.right,
      navBottom: navRect.bottom,
      composerTop: composerRect.top,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout.navLeft).toBeGreaterThanOrEqual(0);
  expect(layout.navRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.navBottom).toBeLessThanOrEqual(layout.composerTop + 8);

  await page.locator('#sendButton').click();
  await expect(page.locator('#sendButton')).toHaveAttribute('aria-label', 'Send message');
  await assertNoHorizontalOverflow(page);
  await assertNoFooterComposerOverlap(page);
});

test('mobile conversations panel opens full width and restores focus when closed', async ({
  page,
}) => {
  await startConversation(page);

  const trigger = page.getByRole('button', { name: 'Conversations' });
  await trigger.focus();
  await trigger.click();

  const panel = page.locator('#conversationPanel');
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox.width).toBeGreaterThanOrEqual(388);

  await page.getByRole('button', { name: 'Close conversations' }).click();
  await expect(page.locator('#conversationPanel.show, #conversationPanel.showing')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('mobile settings uses the single-column flow and returns to chat cleanly', async ({
  page,
}) => {
  await startConversation(page);
  await page.getByRole('button', { name: 'Open settings' }).click();

  await expect(page).toHaveURL(/#\/chat\/settings$/);
  await expect(page.locator('#settingsPage')).toBeVisible();

  await page.getByRole('tab', { name: 'Model' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Model' })).toBeVisible();

  await page.getByRole('button', { name: 'Back to chat' }).click();
  await expect(page).toHaveURL(/#\/chat$/);
  await expect(page.locator('#messageInput')).toBeVisible();
  await assertNoFooterComposerOverlap(page);
});

test('mobile terminal history opens as a full-screen sheet and closes cleanly', async ({
  page,
}) => {
  await seedTerminalConversation(page);
  const hydratedPage = await page.context().newPage();
  await hydratedPage.addInitScript(installMockWorker);
  await hydratedPage.goto('./#/chat');
  await hydratedPage.getByRole('button', { name: 'Conversations' }).click();
  await hydratedPage.getByRole('button', { name: 'Terminal session' }).click();

  const terminalPanel = hydratedPage.locator('#terminalPanel');
  await expect(terminalPanel).toBeVisible();
  await expect(hydratedPage.locator('body')).toHaveClass(/terminal-sheet-open/);

  const panelBox = await terminalPanel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(panelBox.width).toBeGreaterThanOrEqual(388);

  await hydratedPage.locator('#closeTerminalButton').click();
  await expect(hydratedPage.locator('body')).not.toHaveClass(/terminal-sheet-open/);
  await hydratedPage.close();
});
