import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createConversationDownloadController,
  triggerDownload,
} from '../../src/app/conversation-downloads.js';
import {
  addMessageToConversation,
  createConversation,
} from '../../src/state/conversation-model.js';

function createConversationFixture() {
  const conversation = createConversation({
    id: 'conversation-1',
    name: 'Physics Notes',
    modelId: 'model-a',
    startedAt: Date.UTC(2026, 3, 6, 12, 0, 0),
  });
  const userMessage = addMessageToConversation(conversation, 'user', 'Explain energy.', {
    createdAt: Date.UTC(2026, 3, 6, 12, 1, 0),
  });
  addMessageToConversation(conversation, 'model', 'Energy is the capacity to do work.', {
    parentId: userMessage.id,
    createdAt: Date.UTC(2026, 3, 6, 12, 2, 0),
  });
  return conversation;
}

function createControllerHarness(overrides = {}) {
  const conversation = overrides.conversation ?? createConversationFixture();
  const setStatus = vi.fn();
  const triggerDownloadSpy = vi.fn();
  const appState = overrides.appState ?? {
    conversations: conversation ? [conversation] : [],
  };
  const controller = createConversationDownloadController({
    appState,
    getActiveConversation: vi.fn(() => conversation),
    getConversationModelId: vi.fn(() => 'model-a'),
    getActiveTemperature: vi.fn(() => 0.55),
    getConversationSystemPromptSuffix: vi.fn(() => 'Prefer classroom examples.'),
    getToolCallingContext: vi.fn(() => ({
      supported: true,
      enabledTools: ['run_shell_command'],
    })),
    getMessageArtifacts: vi.fn(() => []),
    getStoredGenerationConfigForModel: vi.fn(() => ({ temperature: 0.55 })),
    getModelGenerationLimits: vi.fn(() => ({
      defaultTemperature: 0.7,
      defaultMaxOutputTokens: 256,
      defaultMaxContextTokens: 1024,
    })),
    triggerDownload: triggerDownloadSpy,
    setStatus,
    ...overrides,
  });
  return {
    appState,
    controller,
    conversation,
    setStatus,
    triggerDownloadSpy,
  };
}

describe('conversation-downloads', () => {
  test('triggers a browser download and cleans up the object URL', () => {
    const dom = new JSDOM('<body></body>', { url: 'https://example.test/' });
    const document = dom.window.document;
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:conversation-download'),
      revokeObjectURL: vi.fn(),
    };
    const blob = new Blob(['download']);

    expect(triggerDownload(blob, 'notes.md', { documentRef: document, urlApi })).toBe(true);

    expect(urlApi.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:conversation-download');
    expect(document.querySelector('a')).toBeNull();
  });

  test('downloads the active branch as JSON', async () => {
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness();

    expect(controller.downloadActiveConversationBranchAsJson()).toBe(true);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    const [blob, fileName] = triggerDownloadSpy.mock.calls[0];
    expect(fileName).toBe('physics-notes.llm.json');
    const payload = JSON.parse(await blob.text());
    expect(payload.model).toBe('model-a');
    expect(payload.temperature).toBe(0.55);
    expect(payload.systemPrompt).toBe('Prefer classroom examples.');
    expect(payload.exchanges.map((exchange) => exchange.text)).toEqual([
      'Explain energy.',
      'Energy is the capacity to do work.',
    ]);
    expect(setStatus).toHaveBeenCalledWith('Conversation downloaded as JSON.');
  });

  test('downloads the active branch as Markdown', async () => {
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness();

    expect(controller.downloadActiveConversationBranchAsMarkdown()).toBe(true);

    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    const [blob, fileName] = triggerDownloadSpy.mock.calls[0];
    expect(fileName).toBe('physics-notes.md');
    await expect(blob.text()).resolves.toContain('# Physics Notes');
    await expect(blob.text()).resolves.toContain('Energy is the capacity to do work.');
    expect(setStatus).toHaveBeenCalledWith('Conversation downloaded as Markdown.');
  });

  test('announces empty active-branch download states without creating files', () => {
    const emptyConversation = createConversation({
      id: 'conversation-empty',
      name: 'Empty',
    });
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness({
      conversation: emptyConversation,
    });

    expect(controller.downloadActiveConversationBranchAsJson()).toBe(false);

    expect(triggerDownloadSpy).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('No messages to download on this branch.');
  });

  test('announces missing active conversations without creating files', () => {
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness({
      conversation: null,
      appState: { conversations: [] },
      getActiveConversation: vi.fn(() => null),
    });

    expect(controller.downloadActiveConversationBranchAsMarkdown()).toBe(false);

    expect(triggerDownloadSpy).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('No active conversation to download.');
  });

  test('exports all conversations as a zip archive', async () => {
    const buildBulkConversationExportZipImpl = vi.fn(() => ({
      archiveFileName: 'browser-llm-runner-export.zip',
      bytes: new Uint8Array([80, 75, 3, 4]),
    }));
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness({
      buildBulkConversationExportZipImpl,
    });

    expect(controller.exportAllConversations()).toBe(true);

    expect(buildBulkConversationExportZipImpl).toHaveBeenCalledTimes(1);
    expect(triggerDownloadSpy).toHaveBeenCalledTimes(1);
    const [blob, fileName] = triggerDownloadSpy.mock.calls[0];
    expect(fileName).toBe('browser-llm-runner-export.zip');
    await expect(blob.arrayBuffer()).resolves.toEqual(new Uint8Array([80, 75, 3, 4]).buffer);
    expect(setStatus).toHaveBeenCalledWith('Conversations exported as a zip archive.');
  });

  test('announces when no conversations are available for archive export', () => {
    const buildBulkConversationExportZipImpl = vi.fn();
    const { controller, setStatus, triggerDownloadSpy } = createControllerHarness({
      appState: { conversations: [] },
      buildBulkConversationExportZipImpl,
    });

    expect(controller.exportAllConversations()).toBe(false);

    expect(buildBulkConversationExportZipImpl).not.toHaveBeenCalled();
    expect(triggerDownloadSpy).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('No conversations to export.');
  });
});
