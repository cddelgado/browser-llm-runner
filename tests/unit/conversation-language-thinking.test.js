import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';
import { createConversationLanguageThinkingController } from '../../src/app/conversation-language-thinking.js';
import { createAppState } from '../../src/state/app-state.js';
import { createConversation } from '../../src/state/conversation-model.js';

function createModelOptions() {
  return new Map([
    [
      'model-1',
      {
        displayName: 'Model One',
        languageSupport: {
          tags: [
            { code: 'en', name: 'English' },
            { code: 'es', name: 'Spanish' },
          ],
          hasMore: false,
        },
        thinkingControl: {
          defaultEnabled: true,
          runtimeParameter: 'enable_thinking',
          enabledInstruction: 'Use deliberate reasoning.',
          disabledInstruction: 'Answer directly.',
        },
      },
    ],
    [
      'model-2',
      {
        displayName: 'Model Two',
        languageSupport: {
          tags: [{ code: 'fr', name: 'French' }],
          hasMore: true,
        },
      },
    ],
    [
      'model-3',
      {
        displayName: 'Model Three',
      },
    ],
  ]);
}

function createHarness({ activeConversation = null } = {}) {
  const dom = new JSDOM(`<!doctype html>
    <select id="modelSelect">
      <option value="model-1">Model One</option>
      <option value="model-2">Model Two</option>
      <option value="model-3">Model Three</option>
    </select>
    <select id="conversationLanguageSelect"></select>
    <p id="conversationLanguageHelp"></p>
    <input id="enableModelThinkingToggle" type="checkbox" />
    <p id="enableModelThinkingHelp"></p>`);
  const document = dom.window.document;
  const appState = createAppState({
    defaultSystemPrompt: 'Default classroom prompt.',
  });
  appState.renderMathMl = true;
  appState.pendingConversationLanguagePreference = 'es';
  appState.pendingConversationThinkingEnabled = false;
  const activeConversationRef = { value: activeConversation };
  const dependencies = {
    queueConversationStateSave: vi.fn(),
    getToolCallingContext: vi.fn(() => ({
      supported: true,
      exposedToolNames: ['web_lookup'],
    })),
    getToolCallingSystemPromptSuffix: vi.fn(() => 'Tools are enabled.'),
  };
  const modelSelect = /** @type {HTMLSelectElement} */ (document.getElementById('modelSelect'));
  modelSelect.value = 'model-1';
  const controller = createConversationLanguageThinkingController({
    appState,
    documentRef: document,
    modelOptionsById: createModelOptions(),
    defaultModelId: 'model-1',
    modelSelect,
    conversationLanguageSelect: document.getElementById('conversationLanguageSelect'),
    conversationLanguageHelp: document.getElementById('conversationLanguageHelp'),
    enableModelThinkingToggle: document.getElementById('enableModelThinkingToggle'),
    enableModelThinkingHelp: document.getElementById('enableModelThinkingHelp'),
    normalizeModelId: (modelId) => String(modelId || 'model-1').trim(),
    getActiveConversation: () => activeConversationRef.value,
    getConversationModelId: (conversation) => conversation?.modelId || modelSelect.value,
    getPendingConversationType: () => appState.pendingConversationType,
    getToolCallingContext: dependencies.getToolCallingContext,
    getToolCallingSystemPromptSuffix: dependencies.getToolCallingSystemPromptSuffix,
    queueConversationStateSave: dependencies.queueConversationStateSave,
  });

  return {
    appState,
    controller,
    dependencies,
    document,
    activeConversationRef,
    modelSelect,
  };
}

describe('conversation-language-thinking', () => {
  test('syncs language options, warning text, and thinking controls for the pending draft', () => {
    const harness = createHarness();

    harness.controller.syncConversationLanguageAndThinkingControls(null);

    const languageSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('conversationLanguageSelect')
    );
    const languageHelp = harness.document.getElementById('conversationLanguageHelp');
    const thinkingToggle = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('enableModelThinkingToggle')
    );
    const thinkingHelp = harness.document.getElementById('enableModelThinkingHelp');

    expect(Array.from(languageSelect.options).map((option) => option.value)).toEqual([
      'auto',
      'en',
      'fr',
      'es',
    ]);
    expect(languageSelect.value).toBe('es');
    expect(languageHelp?.textContent).toBe('Spanish is listed for this model.');
    expect(thinkingToggle.checked).toBe(false);
    expect(thinkingToggle.disabled).toBe(false);
    expect(thinkingHelp?.textContent).toBe(
      "Uses the selected model's reasoning switch when one is available."
    );
  });

  test('keeps an unlisted selected language visible and disables unsupported thinking controls', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      modelId: 'model-2',
      languagePreference: 'de',
      thinkingEnabled: true,
    });
    const harness = createHarness({ activeConversation: conversation });

    harness.controller.syncConversationLanguageAndThinkingControls(conversation);

    const languageSelect = /** @type {HTMLSelectElement} */ (
      harness.document.getElementById('conversationLanguageSelect')
    );
    const languageHelp = harness.document.getElementById('conversationLanguageHelp');
    const thinkingToggle = /** @type {HTMLInputElement} */ (
      harness.document.getElementById('enableModelThinkingToggle')
    );
    const thinkingHelp = harness.document.getElementById('enableModelThinkingHelp');

    expect(Array.from(languageSelect.options).map((option) => option.value)).toContain('de');
    expect(languageSelect.value).toBe('de');
    expect(languageHelp?.textContent).toContain("not listed in this app's model card preview");
    expect(thinkingToggle.checked).toBe(true);
    expect(thinkingToggle.disabled).toBe(true);
    expect(thinkingHelp?.textContent).toBe(
      'This model does not expose a thinking switch in this app. This setting currently does nothing.'
    );
  });

  test('applies active conversation preferences with persistence and pending draft preferences locally', () => {
    const conversation = createConversation({
      id: 'conversation-1',
      modelId: 'model-1',
      languagePreference: 'auto',
      thinkingEnabled: true,
    });
    const harness = createHarness({ activeConversation: conversation });

    harness.controller.applyConversationLanguagePreference('fr', { persist: true });
    harness.controller.applyConversationThinkingPreference(false, { persist: true });

    expect(conversation.languagePreference).toBe('fr');
    expect(conversation.thinkingEnabled).toBe(false);
    expect(harness.dependencies.queueConversationStateSave).toHaveBeenCalledTimes(2);

    harness.activeConversationRef.value = null;
    harness.controller.applyConversationLanguagePreference('es', { persist: true });
    harness.controller.applyConversationThinkingPreference(true, { persist: true });

    expect(harness.appState.pendingConversationLanguagePreference).toBe('es');
    expect(harness.appState.pendingConversationThinkingEnabled).toBe(true);
    expect(harness.dependencies.queueConversationStateSave).toHaveBeenCalledTimes(2);
  });

  test('builds optional feature prompts and computed system prompt previews', () => {
    const harness = createHarness();

    const suffix = harness.controller.getConversationSystemPromptSuffix('model-1', null);

    expect(suffix).toContain('Use the appropriate tool to confirm facts before responding.');
    expect(suffix).toContain('Write the final answer in Spanish');
    expect(suffix).toContain('Thinking mode is disabled for this conversation.');
    expect(suffix).toContain('Tools are enabled.');

    const preview = harness.controller.buildComputedConversationSystemPromptPreview({
      conversationPrompt: 'Keep it concise.',
      appendConversationPrompt: true,
      conversationType: 'agent',
      agentName: 'Coach',
      agentDescription: 'Helpful and practical.',
    });

    expect(preview).toContain('Default classroom prompt.');
    expect(preview).toContain('Helpful and practical.');
    expect(preview).toContain('Write the final answer in Spanish');
    expect(preview).toContain('Below is your conversation with the user.');
  });
});
