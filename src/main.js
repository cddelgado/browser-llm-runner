import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './styles.css';
import { LLMEngineClient } from './llm/engine-client.js';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const MODEL_STORAGE_KEY = 'llm-model-preference';
const BACKEND_STORAGE_KEY = 'llm-backend-preference';
const DEFAULT_MODEL = 'onnx-community/Qwen3-0.6B-ONNX';
const UNTITLED_CONVERSATION_PREFIX = 'New Conversation';
const LEGACY_MODEL_ALIASES = {
  'onnx-community/gemma-3-1b-it-ONNX-GQA': DEFAULT_MODEL,
  'onnx-community/gemma-3-1b-ONNX-GQA': DEFAULT_MODEL,
  'Xenova/distilgpt2': DEFAULT_MODEL,
};
const SUPPORTED_MODELS = new Set([DEFAULT_MODEL]);
const TITLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'we',
  'with',
  'you',
  'your',
]);

const themeSelect = document.getElementById('themeSelect');
const modelSelect = document.getElementById('modelSelect');
const backendSelect = document.getElementById('backendSelect');
const statusRegion = document.getElementById('statusRegion');
const loadModelButton = document.getElementById('loadModelButton');
const debugInfo = document.getElementById('debugInfo');
const modelLoadProgressWrap = document.getElementById('modelLoadProgressWrap');
const modelLoadProgressLabel = document.getElementById('modelLoadProgressLabel');
const modelLoadProgressValue = document.getElementById('modelLoadProgressValue');
const modelLoadProgressBar = document.getElementById('modelLoadProgressBar');
const modelLoadError = document.getElementById('modelLoadError');
const modelLoadErrorSummary = document.getElementById('modelLoadErrorSummary');
const modelLoadErrorDetails = document.getElementById('modelLoadErrorDetails');
const stopButton = document.getElementById('stopButton');
const sendButton = document.getElementById('sendButton');
const conversationList = document.getElementById('conversationList');
const newConversationBtn = document.getElementById('newConversationBtn');
const chatForm = document.querySelector('.composer');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const welcomePanel = document.querySelector('.welcome-panel');
const chatTitle = document.getElementById('chatTitle');
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

const engine = new LLMEngineClient();
let modelReady = false;
let isGenerating = false;
let isLoadingModel = false;
let conversationCount = 0;
let conversationIdCounter = 0;
let activeConversationId = null;
const conversations = [];
const debugEntries = [];
const MAX_DEBUG_ENTRIES = 120;

function appendDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  debugEntries.push(`[${timestamp}] ${message}`);
  if (debugEntries.length > MAX_DEBUG_ENTRIES) {
    debugEntries.shift();
  }
  if (debugInfo) {
    debugInfo.textContent = debugEntries.join('\n');
  }
}

function setStatus(message) {
  if (statusRegion) {
    statusRegion.textContent = message;
  }
  appendDebug(`Status: ${message}`);
}

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId) || null;
}

function createConversation(name) {
  conversationCount += 1;
  return {
    id: `conversation-${++conversationIdCounter}`,
    name: name || `${UNTITLED_CONVERSATION_PREFIX} ${conversationCount}`,
    messages: [],
    hasGeneratedName: false,
  };
}

function normalizeConversationName(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 64) {
    return trimmed;
  }
  return `${trimmed.slice(0, 61).trimEnd()}...`;
}

function deriveConversationName(conversation) {
  const firstUserMessage = conversation.messages.find((message) => message.role === 'user')?.text || '';
  const firstModelMessage = conversation.messages.find((message) => message.role === 'model')?.text || '';
  const source = `${firstUserMessage} ${firstModelMessage}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return conversation.name;
  }

  const scoredTokens = new Map();
  source.split(' ').forEach((token) => {
    if (token.length < 3 || TITLE_STOP_WORDS.has(token)) {
      return;
    }
    const existing = scoredTokens.get(token) || { count: 0, order: scoredTokens.size };
    existing.count += 1;
    scoredTokens.set(token, existing);
  });

  const topTokens = [...scoredTokens.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .slice(0, 4)
    .map(([token]) => token.charAt(0).toUpperCase() + token.slice(1));

  if (!topTokens.length) {
    return conversation.name;
  }

  return normalizeConversationName(topTokens.join(' '));
}

function addMessageToConversation(conversation, role, text) {
  const normalizedRole = role === 'user' ? 'user' : 'model';
  const message = {
    id: `${conversation.id}-message-${conversation.messages.length + 1}`,
    role: normalizedRole,
    speaker: normalizedRole === 'user' ? 'User' : 'Model',
    text: String(text || ''),
  };
  conversation.messages.push(message);
  return message;
}

function renderConversationList() {
  if (!conversationList) {
    return;
  }
  conversationList.replaceChildren();

  conversations.forEach((conversation) => {
    const item = document.createElement('li');
    item.className = `conversation-item${conversation.id === activeConversationId ? ' is-active' : ''}`;
    item.dataset.conversationId = conversation.id;

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'conversation-select';
    selectButton.textContent = conversation.name;
    if (conversation.id === activeConversationId) {
      selectButton.setAttribute('aria-current', 'page');
    }

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm btn-link text-danger conversation-delete';
    deleteButton.setAttribute('aria-label', `Delete ${conversation.name} conversation`);
    deleteButton.innerHTML = `
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.5 1h3l.5 1H13a.5.5 0 0 1 0 1h-.6l-.7 10.2A2 2 0 0 1 9.7 15H6.3a2 2 0 0 1-2-1.8L3.6 3H3a.5.5 0 0 1 0-1h3zM5 3l.7 10.1a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 3zM7 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 7 5m2 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 9 5"></path>
      </svg>
    `;

    item.append(selectButton, deleteButton);
    conversationList.appendChild(item);
  });
}

function addMessageElement(message) {
  if (!chatTranscript) {
    return null;
  }
  const item = document.createElement('li');
  item.className = `message-row ${message.role === 'user' ? 'user-message' : 'model-message'}`;
  item.innerHTML = `
    <p class="message-speaker">${message.speaker}</p>
    <p class="message-bubble"></p>
  `;
  const bubble = item.querySelector('.message-bubble');
  if (bubble) {
    bubble.textContent = message.text;
  }
  chatTranscript.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return bubble;
}

function renderTranscript() {
  if (!chatTranscript) {
    return;
  }
  chatTranscript.replaceChildren();
  const conversation = getActiveConversation();
  if (!conversation) {
    return;
  }
  conversation.messages.forEach((message) => {
    addMessageElement(message);
  });
}

function updateWelcomePanelVisibility() {
  if (!welcomePanel) {
    return;
  }
  welcomePanel.classList.toggle('d-none', modelReady);
}

function updateChatTitle() {
  if (!chatTitle) {
    return;
  }
  const activeConversation = getActiveConversation();
  if (activeConversation?.hasGeneratedName) {
    chatTitle.textContent = activeConversation.name;
    return;
  }
  chatTitle.textContent = modelReady ? 'Start Your Chat Now' : 'Choose a Model to Chat';
}

function setActiveConversationById(conversationId) {
  if (activeConversationId === conversationId) {
    return;
  }
  activeConversationId = conversationId;
  renderConversationList();
  renderTranscript();
  updateChatTitle();
}

function ensureConversation() {
  if (getActiveConversation()) {
    return;
  }
  const conversation = createConversation();
  conversations.unshift(conversation);
  activeConversationId = conversation.id;
}

function updateActionButtons() {
  if (sendButton) {
    sendButton.disabled = isGenerating || isLoadingModel || !modelReady;
  }
  if (loadModelButton) {
    loadModelButton.disabled = isGenerating || isLoadingModel;
  }
  if (stopButton) {
    stopButton.disabled = !isGenerating;
  }
  if (newConversationBtn) {
    newConversationBtn.disabled = isGenerating;
  }
}

function showProgressRegion(show) {
  if (!modelLoadProgressWrap) {
    return;
  }
  modelLoadProgressWrap.classList.toggle('d-none', !show);
}

function clearLoadError() {
  if (modelLoadError) {
    modelLoadError.classList.add('d-none');
  }
  if (modelLoadErrorSummary) {
    modelLoadErrorSummary.textContent = '';
  }
  if (modelLoadErrorDetails) {
    modelLoadErrorDetails.replaceChildren();
  }
}

function setLoadProgress({ percent = 0, message = 'Preparing model...' }) {
  const numericPercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  if (modelLoadProgressLabel) {
    modelLoadProgressLabel.textContent = message;
  }
  if (modelLoadProgressValue) {
    modelLoadProgressValue.textContent = `${Math.round(numericPercent)}%`;
  }
  if (modelLoadProgressBar) {
    modelLoadProgressBar.style.width = `${numericPercent}%`;
    modelLoadProgressBar.setAttribute('aria-valuenow', `${Math.round(numericPercent)}`);
  }
}

function showLoadError(errorMessage) {
  if (!modelLoadError) {
    return;
  }

  const parts = String(errorMessage || 'Unknown initialization error')
    .split(' | ')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const [summary, ...details] = parts;
  if (modelLoadErrorSummary) {
    modelLoadErrorSummary.textContent = summary || 'Failed to initialize the selected model.';
  }
  if (modelLoadErrorDetails) {
    modelLoadErrorDetails.replaceChildren();
    details.forEach((detail) => {
      const item = document.createElement('li');
      item.textContent = detail;
      modelLoadErrorDetails.appendChild(item);
    });
  }
  modelLoadError.classList.remove('d-none');
}

function getStoredThemePreference() {
  const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedPreference === 'light' || storedPreference === 'dark' || storedPreference === 'system') {
    return storedPreference;
  }
  return 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return colorSchemeQuery.matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
  if (themeSelect) {
    themeSelect.value = preference;
  }
}

function restoreInferencePreferences() {
  const storedModel = localStorage.getItem(MODEL_STORAGE_KEY);
  const storedBackend = localStorage.getItem(BACKEND_STORAGE_KEY);
  if (modelSelect && storedModel) {
    const normalizedModel = normalizeModelId(storedModel);
    modelSelect.value = normalizedModel;
    localStorage.setItem(MODEL_STORAGE_KEY, normalizedModel);
  }
  if (backendSelect && storedBackend) {
    backendSelect.value = storedBackend;
  }
}

function normalizeModelId(modelId) {
  const canonical = LEGACY_MODEL_ALIASES[modelId] || modelId;
  if (SUPPORTED_MODELS.has(canonical)) {
    return canonical;
  }
  return DEFAULT_MODEL;
}

function readEngineConfigFromUI() {
  const selectedModel = normalizeModelId(modelSelect?.value || DEFAULT_MODEL);
  if (modelSelect && modelSelect.value !== selectedModel) {
    modelSelect.value = selectedModel;
  }
  return {
    modelId: selectedModel,
    backendPreference: backendSelect?.value || 'auto',
  };
}

function persistInferencePreferences() {
  localStorage.setItem(MODEL_STORAGE_KEY, normalizeModelId(modelSelect?.value || DEFAULT_MODEL));
  localStorage.setItem(BACKEND_STORAGE_KEY, backendSelect?.value || 'auto');
}

async function initializeEngine() {
  const config = readEngineConfigFromUI();
  appendDebug(
    `Initialize requested (model=${config.modelId}, backendPreference=${config.backendPreference})`,
  );
  isLoadingModel = true;
  clearLoadError();
  showProgressRegion(true);
  setLoadProgress({ percent: 0, message: 'Starting model load...' });
  updateActionButtons();
  setStatus('Loading model...');
  try {
    await engine.initialize(config);
    modelReady = true;
    isLoadingModel = false;
    setLoadProgress({ percent: 100, message: 'Model ready.' });
    window.setTimeout(() => {
      if (modelReady && !isLoadingModel) {
        showProgressRegion(false);
      }
    }, 300);
    appendDebug('Model initialization succeeded.');
    updateActionButtons();
    updateWelcomePanelVisibility();
    updateChatTitle();
  } catch (error) {
    modelReady = false;
    isLoadingModel = false;
    setStatus(`Error: ${error.message}`);
    showLoadError(error.message);
    appendDebug(`Model initialization failed: ${error.message}`);
    updateActionButtons();
    updateWelcomePanelVisibility();
    updateChatTitle();
    throw error;
  }
}

async function reinitializeEngineFromSettings() {
  persistInferencePreferences();
  modelReady = false;
  setStatus('Settings updated. Select Load model to apply.');
  appendDebug('Inference settings changed; awaiting manual load.');
  updateActionButtons();
  updateWelcomePanelVisibility();
  updateChatTitle();
  if (isGenerating) {
    return;
  }
}

engine.onStatus = (message) => {
  setStatus(message);
};

engine.onBackendResolved = (backend) => {
  setStatus(`Ready (${backend.toUpperCase()})`);
};

engine.onProgress = (progress) => {
  const message = progress?.message || 'Loading model files...';
  const percent = Number.isFinite(progress?.percent) ? progress.percent : 0;
  setLoadProgress({ percent, message });
};

const themePreference = getStoredThemePreference();
applyTheme(themePreference);
restoreInferencePreferences();
ensureConversation();
renderConversationList();
renderTranscript();
setStatus('Welcome. Choose a model, then select Load model.');
showProgressRegion(false);
updateActionButtons();
updateWelcomePanelVisibility();
updateChatTitle();

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value !== 'light' && value !== 'dark' && value !== 'system') {
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme(value);
  });
}

colorSchemeQuery.addEventListener('change', () => {
  if (getStoredThemePreference() === 'system') {
    applyTheme('system');
  }
});

if (modelSelect) {
  modelSelect.addEventListener('change', () => {
    reinitializeEngineFromSettings();
  });
}

if (backendSelect) {
  backendSelect.addEventListener('change', () => {
    reinitializeEngineFromSettings();
  });
}

if (loadModelButton) {
  loadModelButton.addEventListener('click', async () => {
    if (isGenerating) {
      return;
    }
    persistInferencePreferences();
    try {
      await initializeEngine();
    } catch (error) {
      // Status is already updated in initializeEngine.
    }
  });
}

if (newConversationBtn) {
  newConversationBtn.addEventListener('click', () => {
    if (isGenerating) {
      return;
    }
    const conversation = createConversation();
    conversations.unshift(conversation);
    activeConversationId = conversation.id;
    renderConversationList();
    renderTranscript();
    updateChatTitle();
  });
}

if (conversationList) {
  conversationList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (isGenerating) {
      return;
    }

    const deleteButton = target.closest('.conversation-delete');
    if (deleteButton) {
      const item = deleteButton.closest('.conversation-item');
      const conversationId = item?.dataset.conversationId;
      if (!conversationId) {
        return;
      }

      const index = conversations.findIndex((conversation) => conversation.id === conversationId);
      if (index < 0) {
        return;
      }

      const wasActive = activeConversationId === conversationId;
      conversations.splice(index, 1);

      if (!conversations.length) {
        const replacement = createConversation();
        conversations.push(replacement);
      }

      if (wasActive) {
        activeConversationId = conversations[0].id;
      }
      renderConversationList();
      renderTranscript();
      updateChatTitle();
      return;
    }

    const selectButton = target.closest('.conversation-select');
    if (selectButton) {
      const item = selectButton.closest('.conversation-item');
      const conversationId = item?.dataset.conversationId;
      if (conversationId) {
        setActiveConversationById(conversationId);
      }
    }
  });
}

if (stopButton) {
  stopButton.addEventListener('click', async () => {
    if (!isGenerating) {
      return;
    }
    setStatus('Stopping generation...');
    try {
      await engine.cancelGeneration();
      modelReady = true;
      setStatus('Stopped');
      appendDebug('Generation canceled by user.');
    } catch (error) {
      modelReady = false;
      setStatus(`Error: ${error.message}`);
      appendDebug(`Cancel failed: ${error.message}`);
    } finally {
      isGenerating = false;
      updateActionButtons();
    }
  });
}

if (chatForm && messageInput && chatTranscript) {
  chatForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value || isGenerating) {
      return;
    }

    if (!modelReady) {
      setStatus('Please load a model before sending a message.');
      appendDebug('Send blocked: model not ready.');
      if (loadModelButton) {
        loadModelButton.focus();
      }
      return;
    }

    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      return;
    }

    const userMessage = addMessageToConversation(activeConversation, 'user', value);
    addMessageElement(userMessage);
    messageInput.value = '';

    const modelMessage = addMessageToConversation(activeConversation, 'model', '');
    const modelBubble = addMessageElement(modelMessage);
    let streamedText = '';

    isGenerating = true;
    updateActionButtons();

    try {
      await engine.generate(value, {
        onToken: (chunk) => {
          streamedText += chunk;
          modelMessage.text = streamedText.trimStart();
          if (modelBubble) {
            modelBubble.textContent = modelMessage.text;
          }
        },
        onComplete: (finalText) => {
          modelMessage.text = finalText || streamedText.trimStart() || '[No output]';
          if (modelBubble) {
            modelBubble.textContent = modelMessage.text;
          }

          if (!activeConversation.hasGeneratedName && modelMessage.text !== '[No output]') {
            activeConversation.name = deriveConversationName(activeConversation);
            activeConversation.hasGeneratedName = true;
            renderConversationList();
            updateChatTitle();
          }

          appendDebug('Generation completed.');
          isGenerating = false;
          updateActionButtons();
        },
        onError: (message) => {
          modelMessage.text = `Generation error: ${message}`;
          if (modelBubble) {
            modelBubble.textContent = modelMessage.text;
          }
          isGenerating = false;
          updateActionButtons();
          setStatus('Generation failed');
          appendDebug(`Generation error: ${message}`);
        },
      });
    } catch (error) {
      modelMessage.text = `Generation error: ${error.message}`;
      if (modelBubble) {
        modelBubble.textContent = modelMessage.text;
      }
      isGenerating = false;
      updateActionButtons();
      setStatus('Generation failed');
      appendDebug(`Generation error: ${error.message}`);
    }
  });
}

window.addEventListener('beforeunload', () => {
  engine.dispose();
});
