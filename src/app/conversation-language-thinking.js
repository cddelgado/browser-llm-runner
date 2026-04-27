import {
  buildFactCheckingPrompt,
  buildLanguagePreferencePrompt,
  buildMathRenderingFeaturePrompt,
  buildOptionalFeaturePromptSection,
  buildThinkingModePrompt,
} from '../llm/system-prompt.js';
import {
  CONVERSATION_TYPES,
  buildPromptForConversationLeaf,
  createConversation as createConversationRecord,
  normalizeConversationLanguagePreference,
  normalizeConversationName,
  normalizeConversationPromptMode,
  normalizeConversationThinkingEnabled,
  normalizeConversationType,
  normalizeSystemPrompt,
} from '../state/conversation-model.js';

function isElementOfType(value, typeName) {
  const view = value?.ownerDocument?.defaultView || globalThis;
  const TypeCtor = view?.[typeName];
  return typeof TypeCtor === 'function' && value instanceof TypeCtor;
}

/**
 * @param {{
 *   appState: any;
 *   documentRef?: Document;
 *   modelOptionsById: Map<string, any>;
 *   defaultModelId: string;
 *   modelSelect?: any;
 *   conversationLanguageSelect?: any;
 *   conversationLanguageHelp?: any;
 *   enableModelThinkingToggle?: any;
 *   enableModelThinkingHelp?: any;
 *   normalizeModelId: (modelId: string | null | undefined) => string;
 *   getActiveConversation?: () => any;
 *   getConversationModelId: (conversation: any) => string;
 *   getPendingConversationType?: () => string;
 *   getToolCallingContext?: (modelId: string) => any;
 *   getToolCallingSystemPromptSuffix?: (modelId: string) => string;
 *   queueConversationStateSave?: () => void;
 * }} options
 */
export function createConversationLanguageThinkingController({
  appState,
  documentRef = document,
  modelOptionsById,
  defaultModelId,
  modelSelect = null,
  conversationLanguageSelect = null,
  conversationLanguageHelp = null,
  enableModelThinkingToggle = null,
  enableModelThinkingHelp = null,
  normalizeModelId,
  getActiveConversation = () => null,
  getConversationModelId,
  getPendingConversationType = () => CONVERSATION_TYPES.CHAT,
  getToolCallingContext = () => ({ supported: false, exposedToolNames: [] }),
  getToolCallingSystemPromptSuffix = () => '',
  queueConversationStateSave = () => {},
}) {
  function getSelectedModelId() {
    return normalizeModelId(modelSelect?.value || defaultModelId);
  }

  function getThinkingControlForModel(modelId) {
    return modelOptionsById.get(normalizeModelId(modelId))?.thinkingControl || null;
  }

  function getLanguageSupportForModel(modelId) {
    return modelOptionsById.get(normalizeModelId(modelId))?.languageSupport || null;
  }

  function getConversationLanguagePreference(conversation) {
    return normalizeConversationLanguagePreference(
      conversation
        ? conversation.languagePreference
        : appState.pendingConversationLanguagePreference
    );
  }

  function getConversationThinkingEnabled(conversation) {
    const modelId = conversation ? getConversationModelId(conversation) : getSelectedModelId();
    const defaultEnabled = getThinkingControlForModel(modelId)?.defaultEnabled !== false;
    return normalizeConversationThinkingEnabled(
      conversation ? conversation.thinkingEnabled : appState.pendingConversationThinkingEnabled,
      defaultEnabled
    );
  }

  function getSelectedLanguageMetadata(languagePreference) {
    const normalizedPreference = normalizeConversationLanguagePreference(languagePreference);
    if (normalizedPreference === 'auto') {
      return {
        code: 'auto',
        label: 'Auto',
        name: '',
      };
    }
    const displayNames =
      typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['en'], { type: 'language' })
        : null;
    const code = normalizedPreference.toLowerCase();
    const baseCode = code.split('-')[0];
    const name = displayNames?.of(code) || displayNames?.of(baseCode) || code.toUpperCase();
    return {
      code,
      label: `${name} (${code.toUpperCase()})`,
      name,
    };
  }

  function getOptionalFeatureSystemPromptSection(modelId, conversation = null) {
    const languagePreference = getConversationLanguagePreference(conversation);
    const thinkingControl = getThinkingControlForModel(modelId);
    const toolContext = getToolCallingContext(modelId);
    return buildOptionalFeaturePromptSection([
      buildFactCheckingPrompt({
        toolUseAvailable: toolContext.supported && toolContext.exposedToolNames.length > 0,
      }),
      buildMathRenderingFeaturePrompt({ renderMathMl: appState.renderMathMl }),
      buildLanguagePreferencePrompt({
        languageName:
          languagePreference === 'auto' ? '' : getSelectedLanguageMetadata(languagePreference).name,
      }),
      buildThinkingModePrompt({
        enabled: getConversationThinkingEnabled(conversation),
        enabledInstruction: thinkingControl?.enabledInstruction,
        disabledInstruction: thinkingControl?.disabledInstruction,
      }),
    ]);
  }

  function getConversationSystemPromptSuffix(modelId, conversation = null) {
    return [
      getOptionalFeatureSystemPromptSection(modelId, conversation),
      getToolCallingSystemPromptSuffix(modelId),
    ]
      .map((section) => normalizeSystemPrompt(section))
      .filter(Boolean)
      .join('\n\n');
  }

  function getConversationLanguageWarningText(modelId, languagePreference) {
    const normalizedPreference = normalizeConversationLanguagePreference(languagePreference);
    if (normalizedPreference === 'auto') {
      return 'Auto leaves language choice to your prompt and the model.';
    }
    const selectedLanguage = getSelectedLanguageMetadata(normalizedPreference);
    const languageSupport = getLanguageSupportForModel(modelId);
    const supportedTags = Array.isArray(languageSupport?.tags) ? languageSupport.tags : [];
    const isExplicitlySupported = supportedTags.some(
      (tag) => typeof tag?.code === 'string' && tag.code.toLowerCase() === selectedLanguage.code
    );
    if (isExplicitlySupported) {
      return `${selectedLanguage.name} is listed for this model.`;
    }
    if (languageSupport?.hasMore === true) {
      return `${selectedLanguage.name} is not listed in this app's model card preview. It may still work, but cool and scary things can happen.`;
    }
    if (supportedTags.length) {
      return `${selectedLanguage.name} is not listed for this model. It may still work, but cool and scary things can happen.`;
    }
    return `This app does not have published language support metadata for the selected model. ${selectedLanguage.name} may work, but cool and scary things can happen.`;
  }

  function getConversationLanguageOptions() {
    const optionsByCode = new Map([['auto', { code: 'auto', label: 'Auto' }]]);
    modelOptionsById.forEach((model) => {
      const tags = Array.isArray(model?.languageSupport?.tags) ? model.languageSupport.tags : [];
      tags.forEach((tag) => {
        const code = typeof tag?.code === 'string' ? tag.code.trim().toLowerCase() : '';
        const name = typeof tag?.name === 'string' ? tag.name.trim() : '';
        if (!code || !name || optionsByCode.has(code)) {
          return;
        }
        optionsByCode.set(code, {
          code,
          label: `${name} (${code.toUpperCase()})`,
        });
      });
    });
    return [...optionsByCode.values()].sort((left, right) => {
      if (left.code === 'auto') {
        return -1;
      }
      if (right.code === 'auto') {
        return 1;
      }
      return left.label.localeCompare(right.label);
    });
  }

  function syncConversationLanguageAndThinkingControls(conversation = getActiveConversation()) {
    const modelId = conversation ? getConversationModelId(conversation) : getSelectedModelId();
    const languagePreference = getConversationLanguagePreference(conversation);
    const thinkingControl = getThinkingControlForModel(modelId);
    if (isElementOfType(conversationLanguageSelect, 'HTMLSelectElement')) {
      const options = getConversationLanguageOptions();
      conversationLanguageSelect.replaceChildren();
      options.forEach((option) => {
        const node = documentRef.createElement('option');
        node.value = option.code;
        node.textContent = option.label;
        conversationLanguageSelect.appendChild(node);
      });
      if (!options.some((option) => option.code === languagePreference)) {
        const selectedLanguage = getSelectedLanguageMetadata(languagePreference);
        const node = documentRef.createElement('option');
        node.value = selectedLanguage.code;
        node.textContent = selectedLanguage.label;
        conversationLanguageSelect.appendChild(node);
      }
      conversationLanguageSelect.value = languagePreference;
    }
    if (isElementOfType(conversationLanguageHelp, 'HTMLElement')) {
      conversationLanguageHelp.textContent = getConversationLanguageWarningText(
        modelId,
        languagePreference
      );
    }
    if (isElementOfType(enableModelThinkingToggle, 'HTMLInputElement')) {
      enableModelThinkingToggle.checked = getConversationThinkingEnabled(conversation);
      enableModelThinkingToggle.disabled = !thinkingControl;
    }
    if (isElementOfType(enableModelThinkingHelp, 'HTMLElement')) {
      enableModelThinkingHelp.textContent = thinkingControl
        ? "Uses the selected model's reasoning switch when one is available."
        : 'This model does not expose a thinking switch in this app. This setting currently does nothing.';
    }
  }

  function buildComputedConversationSystemPromptPreview({
    conversationPrompt = '',
    appendConversationPrompt = true,
    conversationType = '',
    agentName = '',
    agentDescription = '',
  } = {}) {
    const activeConversation = getActiveConversation();
    const previewConversationType = normalizeConversationType(
      conversationType || activeConversation?.conversationType || getPendingConversationType()
    );
    const modelId = activeConversation
      ? getConversationModelId(activeConversation)
      : getSelectedModelId();
    const normalizedConversationPrompt = normalizeSystemPrompt(conversationPrompt);
    const normalizedAppendConversationPrompt =
      normalizeConversationPromptMode(appendConversationPrompt);
    const normalizedAgentName = normalizeConversationName(agentName);
    const normalizedAgentDescription = normalizeSystemPrompt(agentDescription);
    const promptTarget = activeConversation
      ? {
          ...activeConversation,
          name:
            previewConversationType === CONVERSATION_TYPES.AGENT
              ? normalizedAgentName ||
                activeConversation?.agent?.name ||
                activeConversation.name ||
                'Agent'
              : activeConversation.name,
          conversationSystemPrompt: normalizedConversationPrompt,
          appendConversationSystemPrompt: normalizedAppendConversationPrompt,
          agent:
            previewConversationType === CONVERSATION_TYPES.AGENT
              ? {
                  ...(activeConversation.agent || {}),
                  name:
                    normalizedAgentName ||
                    activeConversation?.agent?.name ||
                    activeConversation.name ||
                    'Agent',
                  description: normalizedAgentDescription,
                }
              : activeConversation.agent,
        }
      : {
          ...createConversationRecord({
            id: 'conversation-system-prompt-preview',
            name:
              previewConversationType === CONVERSATION_TYPES.AGENT
                ? normalizedAgentName || 'Agent'
                : 'Prompt Preview',
            modelId,
            conversationType: previewConversationType,
            systemPrompt: appState.defaultSystemPrompt,
            languagePreference: appState.pendingConversationLanguagePreference,
            thinkingEnabled: appState.pendingConversationThinkingEnabled,
            agent:
              previewConversationType === CONVERSATION_TYPES.AGENT
                ? {
                    name: normalizedAgentName || 'Agent',
                    description: normalizedAgentDescription,
                  }
                : null,
          }),
          conversationSystemPrompt: normalizedConversationPrompt,
          appendConversationSystemPrompt: normalizedAppendConversationPrompt,
        };
    const systemPromptSuffix = [
      getConversationSystemPromptSuffix(modelId, promptTarget),
      'Below is your conversation with the user.',
    ]
      .map((section) => normalizeSystemPrompt(section))
      .filter(Boolean)
      .join('\n\n');
    const promptMessages = buildPromptForConversationLeaf(
      promptTarget,
      promptTarget.activeLeafMessageId,
      {
        systemPromptSuffix,
      }
    );
    return (
      promptMessages.find(
        (message) =>
          message?.role === 'system' &&
          typeof message.content === 'string' &&
          message.content.trim()
      )?.content || ''
    );
  }

  function applyConversationLanguagePreference(value, { persist = false } = {}) {
    const activeConversation = getActiveConversation();
    const normalizedValue = normalizeConversationLanguagePreference(value);
    if (activeConversation) {
      activeConversation.languagePreference = normalizedValue;
      if (persist) {
        queueConversationStateSave();
      }
    } else {
      appState.pendingConversationLanguagePreference = normalizedValue;
    }
    syncConversationLanguageAndThinkingControls(activeConversation);
  }

  function applyConversationThinkingPreference(value, { persist = false } = {}) {
    const activeConversation = getActiveConversation();
    const nextValue = normalizeConversationThinkingEnabled(value);
    if (activeConversation) {
      activeConversation.thinkingEnabled = nextValue;
      if (persist) {
        queueConversationStateSave();
      }
    } else {
      appState.pendingConversationThinkingEnabled = nextValue;
    }
    syncConversationLanguageAndThinkingControls(activeConversation);
  }

  return {
    applyConversationLanguagePreference,
    applyConversationThinkingPreference,
    buildComputedConversationSystemPromptPreview,
    getConversationLanguageOptions,
    getConversationLanguagePreference,
    getConversationLanguageWarningText,
    getConversationSystemPromptSuffix,
    getConversationThinkingEnabled,
    getLanguageSupportForModel,
    getOptionalFeatureSystemPromptSection,
    getSelectedLanguageMetadata,
    getThinkingControlForModel,
    syncConversationLanguageAndThinkingControls,
  };
}
