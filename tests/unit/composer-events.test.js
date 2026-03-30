import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindComposerEvents } from '../../src/app/composer-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div>
        <form class="composer">
          <textarea id="messageInput"></textarea>
          <button id="sendButton" type="submit"></button>
          <input id="imageAttachmentInput" type="file" />
        </form>
        <button id="addImagesButton" type="button"></button>
        <button id="attachReferenceMenuItem" type="button"></button>
        <button id="attachWorkWithMenuItem" type="button"></button>
        <div id="composerAttachmentTray">
          <button class="composer-attachment-remove" data-attachment-index="0"></button>
        </div>
      </div>
    `,
    { url: 'https://example.test/' },
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  const appState = {
    activeGenerationConfig: { temperature: 0.7 },
    pendingComposerAttachments: [{ filename: 'diagram.png' }],
    conversations: [],
    activeConversationId: null,
    isPreparingNewConversation: false,
  };
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');

  return {
    dom,
    document,
    appState,
    messageInput,
    sendButton,
    deps: {
      appState,
      chatForm: document.querySelector('.composer'),
      messageInput,
      sendButton,
      addImagesButton: document.getElementById('addImagesButton'),
      attachReferenceMenuItem: document.getElementById('attachReferenceMenuItem'),
      attachWorkWithMenuItem: document.getElementById('attachWorkWithMenuItem'),
      imageAttachmentInput: document.getElementById('imageAttachmentInput'),
      composerAttachmentTray: document.getElementById('composerAttachmentTray'),
      isGeneratingResponse: vi.fn(() => false),
      isOrchestrationRunningState: vi.fn(() => false),
      isMessageEditActive: vi.fn(() => false),
      isEngineReady: vi.fn(() => false),
      hasStartedWorkspace: vi.fn(() => false),
      setChatWorkspaceStarted: vi.fn((state, value) => {
        state.hasStartedChatWorkspace = value;
      }),
      setPreparingNewConversation: vi.fn((state, value) => {
        state.isPreparingNewConversation = value;
      }),
      updateWelcomePanelVisibility: vi.fn(),
      getPendingComposerAttachments: vi.fn(() => appState.pendingComposerAttachments),
      selectedModelSupportsImageInput: vi.fn(() => false),
      createComposerAttachmentFromFile: vi.fn(),
      renderComposerAttachments: vi.fn(),
      setStatus: vi.fn(),
      clearPendingComposerAttachments: vi.fn(() => {
        appState.pendingComposerAttachments = [];
      }),
      createConversation: vi.fn(() => ({ id: 'conversation-1', messageNodes: [] })),
      clearUserMessageEditSession: vi.fn(),
      setChatTitleEditing: vi.fn(),
      renderConversationList: vi.fn(),
      renderTranscript: vi.fn(),
      updateChatTitle: vi.fn(),
      queueConversationStateSave: vi.fn(),
      getActiveConversation: vi.fn(() => null),
      syncConversationModelSelection: vi.fn(() => ({ selectedModelId: 'model-1' })),
      getLoadedModelId: vi.fn(() => null),
      persistInferencePreferences: vi.fn(),
      initializeEngine: vi.fn(async () => {}),
      appendDebug: vi.fn(),
      buildUserMessageAttachmentPayload: vi.fn(() => ({ contentParts: [], artifactRefs: [] })),
      addMessageToConversation: vi.fn(() => ({ id: 'message-1' })),
      addMessageElement: vi.fn(),
      buildPromptForActiveConversation: vi.fn(() => 'prompt'),
      startModelGeneration: vi.fn(),
      stopGeneration: vi.fn(async () => {}),
    },
  };
}

describe('composer-events', () => {
  test('stops generation from the send button when the engine is streaming', async () => {
    const harness = createHarness();
    harness.deps.isGeneratingResponse.mockReturnValue(true);
    bindComposerEvents(harness.deps);

    harness.sendButton.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    await Promise.resolve();
    expect(harness.deps.stopGeneration).toHaveBeenCalledTimes(1);
  });

  test('removes a pending attachment and refreshes the tray', () => {
    const harness = createHarness();
    bindComposerEvents(harness.deps);

    harness.document.querySelector('.composer-attachment-remove')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );

    expect(harness.appState.pendingComposerAttachments).toEqual([]);
    expect(harness.deps.renderComposerAttachments).toHaveBeenCalledTimes(1);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('Removed diagram.png.');
  });

  test('opens the file picker from the reference menu option with the curated file filter', () => {
    const harness = createHarness();
    const clickSpy = vi.fn();
    harness.deps.imageAttachmentInput.click = clickSpy;
    bindComposerEvents(harness.deps);

    harness.deps.attachReferenceMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(harness.deps.imageAttachmentInput.accept).toBe('.txt,.csv,.md,.html,.htm,.css,.js,.pdf');
  });

  test('opens the file picker from the work-with menu option without an accept filter', () => {
    const harness = createHarness();
    const clickSpy = vi.fn();
    harness.deps.imageAttachmentInput.click = clickSpy;
    bindComposerEvents(harness.deps);

    harness.deps.attachWorkWithMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(harness.deps.imageAttachmentInput.accept).toBe('');
  });

  test('blocks submit while a message edit is active', () => {
    const harness = createHarness();
    harness.deps.isMessageEditActive.mockReturnValue(true);
    harness.messageInput.value = 'Hello';
    bindComposerEvents(harness.deps);

    harness.deps.chatForm.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );

    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Save or cancel the current message edit before sending a new message.',
    );
    expect(harness.deps.startModelGeneration).not.toHaveBeenCalled();
  });

  test('creates a new conversation only when the first prompt is submitted', async () => {
    const harness = createHarness();
    harness.appState.isPreparingNewConversation = true;
    harness.deps.hasStartedWorkspace.mockReturnValue(true);
    harness.deps.isEngineReady.mockReturnValue(true);
    harness.deps.getLoadedModelId.mockReturnValue('model-1');
    harness.messageInput.value = 'Hello';
    bindComposerEvents(harness.deps);

    harness.deps.chatForm.dispatchEvent(
      new harness.dom.window.Event('submit', { bubbles: true, cancelable: true }),
    );

    await Promise.resolve();

    expect(harness.deps.createConversation).toHaveBeenCalledTimes(1);
    expect(harness.deps.setPreparingNewConversation).toHaveBeenCalledWith(harness.appState, false);
    expect(harness.appState.activeConversationId).toBe('conversation-1');
    expect(harness.deps.initializeEngine).not.toHaveBeenCalled();
    expect(harness.deps.updateWelcomePanelVisibility).toHaveBeenCalledWith({ replaceRoute: false });
    expect(harness.deps.addMessageToConversation).toHaveBeenCalledTimes(1);
    expect(harness.deps.startModelGeneration).toHaveBeenCalledTimes(1);
  });

  test('accepts reference attachments for html files', async () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [];
    harness.deps.getPendingComposerAttachments.mockImplementation(
      () => harness.appState.pendingComposerAttachments
    );
    harness.deps.createComposerAttachmentFromFile.mockImplementation(async (file) => ({
      id: `attachment-${file.name}`,
      type: 'file',
      filename: file.name,
    }));
    bindComposerEvents(harness.deps);

    const attachmentInput = harness.deps.imageAttachmentInput;
    harness.deps.attachReferenceMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    Object.defineProperty(attachmentInput, 'files', {
      configurable: true,
      value: [
        new harness.dom.window.File(['<h1>Hello</h1>'], 'index.html', { type: 'text/html' }),
        new harness.dom.window.File(['beta'], 'photo.png', { type: 'image/png' }),
      ],
    });

    attachmentInput.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true, cancelable: true })
    );

    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.deps.createComposerAttachmentFromFile).toHaveBeenCalledTimes(1);
    expect(harness.appState.pendingComposerAttachments).toEqual([
      expect.objectContaining({ filename: 'index.html', type: 'file' }),
    ]);
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      '1 file attached. 1 unsupported attachment skipped.'
    );
  });

  test('accepts pdf attachments when image input is unavailable', async () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [];
    harness.deps.getPendingComposerAttachments.mockImplementation(
      () => harness.appState.pendingComposerAttachments
    );
    harness.deps.createComposerAttachmentFromFile.mockImplementation(async (file) => ({
      id: `attachment-${file.name}`,
      type: 'file',
      filename: file.name,
      extension: 'pdf',
    }));
    bindComposerEvents(harness.deps);

    const attachmentInput = harness.deps.imageAttachmentInput;
    Object.defineProperty(attachmentInput, 'files', {
      configurable: true,
      value: [new harness.dom.window.File(['%PDF-1.7'], 'lesson.pdf', { type: 'application/pdf' })],
    });

    attachmentInput.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true, cancelable: true })
    );

    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.deps.createComposerAttachmentFromFile).toHaveBeenCalledTimes(1);
    expect(harness.appState.pendingComposerAttachments).toEqual([
      expect.objectContaining({ filename: 'lesson.pdf', type: 'file', extension: 'pdf' }),
    ]);
    expect(harness.deps.setStatus).toHaveBeenCalledWith('1 file attached.');
  });

  test('reference menu rejects unsupported files outside the curated set', async () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [];
    harness.deps.selectedModelSupportsImageInput.mockReturnValue(true);
    harness.deps.getPendingComposerAttachments.mockImplementation(
      () => harness.appState.pendingComposerAttachments
    );
    harness.deps.createComposerAttachmentFromFile.mockImplementation(async (file) => ({
      id: `attachment-${file.name}`,
      type: 'file',
      filename: file.name,
    }));
    bindComposerEvents(harness.deps);

    harness.deps.attachReferenceMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const attachmentInput = harness.deps.imageAttachmentInput;
    Object.defineProperty(attachmentInput, 'files', {
      configurable: true,
      value: [new harness.dom.window.File(['binary'], 'photo.png', { type: 'image/png' })],
    });

    attachmentInput.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true, cancelable: true })
    );

    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.deps.createComposerAttachmentFromFile).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'Only .txt, .csv, .md, .html, .htm, .css, .js, and .pdf files can be attached from this menu option.'
    );
  });

  test('work-with menu still routes supported files through the existing attachment pipeline', async () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [];
    harness.deps.selectedModelSupportsImageInput.mockReturnValue(true);
    harness.deps.getPendingComposerAttachments.mockImplementation(
      () => harness.appState.pendingComposerAttachments
    );
    harness.deps.createComposerAttachmentFromFile.mockImplementation(async (file) => ({
      id: `attachment-${file.name}`,
      type: 'file',
      filename: file.name,
    }));
    bindComposerEvents(harness.deps);

    harness.deps.attachWorkWithMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const attachmentInput = harness.deps.imageAttachmentInput;
    Object.defineProperty(attachmentInput, 'files', {
      configurable: true,
      value: [
        new harness.dom.window.File(['body { color: red; }'], 'site.css', { type: 'text/css' }),
      ],
    });

    attachmentInput.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true, cancelable: true })
    );

    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.deps.createComposerAttachmentFromFile).toHaveBeenCalledTimes(1);
    expect(harness.appState.pendingComposerAttachments).toEqual([
      expect.objectContaining({ filename: 'site.css', type: 'file' }),
    ]);
  });

  test('work-with menu shows the current unsupported-file message for unsupported files', async () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [];
    harness.deps.selectedModelSupportsImageInput.mockReturnValue(false);
    harness.deps.getPendingComposerAttachments.mockImplementation(
      () => harness.appState.pendingComposerAttachments
    );
    bindComposerEvents(harness.deps);

    harness.deps.attachWorkWithMenuItem.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    const attachmentInput = harness.deps.imageAttachmentInput;
    Object.defineProperty(attachmentInput, 'files', {
      configurable: true,
      value: [new harness.dom.window.File(['zipdata'], 'archive.zip', { type: 'application/zip' })],
    });

    attachmentInput.dispatchEvent(
      new harness.dom.window.Event('change', { bubbles: true, cancelable: true })
    );

    await new Promise((resolve) => harness.dom.window.setTimeout(resolve, 0));

    expect(harness.deps.createComposerAttachmentFromFile).not.toHaveBeenCalled();
    expect(harness.deps.setStatus).toHaveBeenCalledWith(
      'The selected files are not supported yet. Try a .txt, .csv, .md, .html, .htm, .css, .js, or .pdf file.'
    );
  });
});
