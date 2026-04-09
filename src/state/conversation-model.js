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

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

export const CONVERSATION_TYPES = Object.freeze({
  CHAT: 'chat',
  AGENT: 'agent',
});

function normalizeArtifactRef(rawRef) {
  if (!rawRef || typeof rawRef !== 'object') {
    return null;
  }
  const id = typeof rawRef.id === 'string' ? rawRef.id.trim() : '';
  if (!id) {
    return null;
  }
  const normalizedRef = { id };
  if (typeof rawRef.kind === 'string' && rawRef.kind.trim()) {
    normalizedRef.kind = rawRef.kind.trim();
  }
  if (typeof rawRef.mimeType === 'string' && rawRef.mimeType.trim()) {
    normalizedRef.mimeType = rawRef.mimeType.trim();
  }
  if (typeof rawRef.filename === 'string' && rawRef.filename.trim()) {
    normalizedRef.filename = rawRef.filename.trim();
  }
  if (typeof rawRef.workspacePath === 'string' && rawRef.workspacePath.trim()) {
    normalizedRef.workspacePath = rawRef.workspacePath.trim();
  }
  if (rawRef.hash && typeof rawRef.hash === 'object') {
    const algorithm =
      typeof rawRef.hash.algorithm === 'string' && rawRef.hash.algorithm.trim()
        ? rawRef.hash.algorithm.trim()
        : '';
    const value =
      typeof rawRef.hash.value === 'string' && rawRef.hash.value.trim() ? rawRef.hash.value.trim() : '';
    if (algorithm && value) {
      normalizedRef.hash = { algorithm, value };
    }
  }
  return normalizedRef;
}

function normalizeMessageArtifactRefs(rawRefs) {
  if (!Array.isArray(rawRefs)) {
    return [];
  }
  return rawRefs.map(normalizeArtifactRef).filter(Boolean);
}

function normalizeImageContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const base64 = typeof rawPart.base64 === 'string' ? rawPart.base64.trim() : '';
  const url = typeof rawPart.url === 'string' ? rawPart.url.trim() : '';
  const image = typeof rawPart.image === 'string' ? rawPart.image.trim() : '';
  if (!artifactId && !mimeType && !base64 && !url && !image) {
    return null;
  }
  const normalizedPart = { type: 'image' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (base64) {
    normalizedPart.base64 = base64;
  }
  if (url) {
    normalizedPart.url = url;
  }
  if (image) {
    normalizedPart.image = image;
  }
  if (typeof rawPart.filename === 'string' && rawPart.filename.trim()) {
    normalizedPart.filename = rawPart.filename.trim();
  }
  if (typeof rawPart.width === 'number' && Number.isFinite(rawPart.width) && rawPart.width > 0) {
    normalizedPart.width = Math.round(rawPart.width);
  }
  if (typeof rawPart.height === 'number' && Number.isFinite(rawPart.height) && rawPart.height > 0) {
    normalizedPart.height = Math.round(rawPart.height);
  }
  if (typeof rawPart.alt === 'string') {
    normalizedPart.alt = rawPart.alt;
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeAudioContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const base64 = typeof rawPart.base64 === 'string' ? rawPart.base64.trim() : '';
  const url = typeof rawPart.url === 'string' ? rawPart.url.trim() : '';
  const samplesBase64 =
    typeof rawPart.samplesBase64 === 'string' ? rawPart.samplesBase64.trim() : '';
  if (!artifactId && !mimeType && !base64 && !url && !samplesBase64) {
    return null;
  }
  const normalizedPart = { type: 'audio' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (base64) {
    normalizedPart.base64 = base64;
  }
  if (url) {
    normalizedPart.url = url;
  }
  if (samplesBase64) {
    normalizedPart.samplesBase64 = samplesBase64;
  }
  if (typeof rawPart.filename === 'string' && rawPart.filename.trim()) {
    normalizedPart.filename = rawPart.filename.trim();
  }
  if (Number.isFinite(rawPart.size) && rawPart.size >= 0) {
    normalizedPart.size = Math.round(rawPart.size);
  }
  if (Number.isFinite(rawPart.durationSeconds) && rawPart.durationSeconds >= 0) {
    normalizedPart.durationSeconds = rawPart.durationSeconds;
  }
  if (Number.isFinite(rawPart.sampleRate) && rawPart.sampleRate > 0) {
    normalizedPart.sampleRate = Math.round(rawPart.sampleRate);
  }
  if (Number.isFinite(rawPart.sampleCount) && rawPart.sampleCount > 0) {
    normalizedPart.sampleCount = Math.round(rawPart.sampleCount);
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeFileContentPart(rawPart) {
  const artifactId = typeof rawPart.artifactId === 'string' ? rawPart.artifactId.trim() : '';
  const mimeType = typeof rawPart.mimeType === 'string' ? rawPart.mimeType.trim() : '';
  const filename = typeof rawPart.filename === 'string' ? rawPart.filename.trim() : '';
  const text = typeof rawPart.text === 'string' ? rawPart.text : '';
  const normalizedText = typeof rawPart.normalizedText === 'string' ? rawPart.normalizedText : '';
  const llmText = typeof rawPart.llmText === 'string' ? rawPart.llmText : '';
  if (!artifactId && !mimeType && !filename && !text.trim() && !normalizedText.trim() && !llmText.trim()) {
    return null;
  }
  const normalizedPart = { type: 'file' };
  if (artifactId) {
    normalizedPart.artifactId = artifactId;
  }
  if (mimeType) {
    normalizedPart.mimeType = mimeType;
  }
  if (filename) {
    normalizedPart.filename = filename;
  }
  if (text) {
    normalizedPart.text = text;
  }
  if (normalizedText) {
    normalizedPart.normalizedText = normalizedText;
  }
  if (llmText) {
    normalizedPart.llmText = llmText;
  }
  if (typeof rawPart.normalizedFormat === 'string' && rawPart.normalizedFormat.trim()) {
    normalizedPart.normalizedFormat = rawPart.normalizedFormat.trim().toLowerCase();
  }
  if (Array.isArray(rawPart.conversionWarnings)) {
    const conversionWarnings = rawPart.conversionWarnings
      .filter((warning) => typeof warning === 'string')
      .map((warning) => warning.trim())
      .filter(Boolean);
    if (conversionWarnings.length) {
      normalizedPart.conversionWarnings = conversionWarnings;
    }
  }
  if (rawPart.memoryHint && typeof rawPart.memoryHint === 'object') {
    const ingestible = rawPart.memoryHint.ingestible === true;
    const preferredSource =
      typeof rawPart.memoryHint.preferredSource === 'string' ? rawPart.memoryHint.preferredSource.trim() : '';
    const documentRole =
      typeof rawPart.memoryHint.documentRole === 'string' ? rawPart.memoryHint.documentRole.trim() : '';
    if (ingestible || preferredSource || documentRole) {
      normalizedPart.memoryHint = {};
      if (ingestible) {
        normalizedPart.memoryHint.ingestible = true;
      }
      if (preferredSource) {
        normalizedPart.memoryHint.preferredSource = preferredSource;
      }
      if (documentRole) {
        normalizedPart.memoryHint.documentRole = documentRole;
      }
    }
  }
  if (typeof rawPart.extension === 'string' && rawPart.extension.trim()) {
    normalizedPart.extension = rawPart.extension.trim().toLowerCase();
  }
  if (Number.isFinite(rawPart.size) && rawPart.size >= 0) {
    normalizedPart.size = Math.round(rawPart.size);
  }
  if (Number.isFinite(rawPart.pageCount) && rawPart.pageCount > 0) {
    normalizedPart.pageCount = Math.round(rawPart.pageCount);
  }
  if (typeof rawPart.workspacePath === 'string' && rawPart.workspacePath.trim()) {
    normalizedPart.workspacePath = rawPart.workspacePath.trim();
  }
  return normalizedPart;
}

function normalizeMessageContentPart(rawPart) {
  if (!rawPart || typeof rawPart !== 'object') {
    return null;
  }
  if (rawPart.type === 'text') {
    const text = typeof rawPart.text === 'string' ? rawPart.text : '';
    if (!text.trim()) {
      return null;
    }
    return {
      type: 'text',
      text,
    };
  }
  if (rawPart.type === 'image') {
    return normalizeImageContentPart(rawPart);
  }
  if (rawPart.type === 'audio') {
    return normalizeAudioContentPart(rawPart);
  }
  if (rawPart.type === 'file') {
    return normalizeFileContentPart(rawPart);
  }
  return null;
}

export function normalizeMessageContentParts(rawParts, fallbackText = '') {
  const normalizedParts = Array.isArray(rawParts)
    ? rawParts.map(normalizeMessageContentPart).filter(Boolean)
    : [];
  if (normalizedParts.length) {
    return normalizedParts;
  }
  const text = String(fallbackText || '');
  return text.trim()
    ? [
        {
          type: 'text',
          text,
        },
      ]
    : [];
}

export function getTextFromMessageContentParts(parts, fallbackText = '') {
  const normalizedParts = normalizeMessageContentParts(parts, fallbackText);
  const textParts = normalizedParts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text);
  const joinedText = textParts.join('\n').trim();
  return joinedText || String(fallbackText || '');
}

function buildUserMessageLlmRepresentation(parts, fallbackText = '') {
  const normalizedParts = normalizeMessageContentParts(parts, fallbackText);
  if (!normalizedParts.length) {
    return String(fallbackText || '').trim() ? String(fallbackText || '') : '';
  }

  const llmParts = normalizedParts
    .map((part) => {
      if (part.type === 'text') {
        return {
          type: 'text',
          text: part.text,
        };
      }
      if (part.type === 'image') {
        return { ...part };
      }
      if (part.type === 'audio') {
        return { ...part };
      }
      if (part.type === 'file') {
        const llmText = typeof part.llmText === 'string' ? part.llmText : '';
        if (!llmText.trim()) {
          return null;
        }
        return {
          type: 'text',
          text: llmText,
        };
      }
      return null;
    })
    .filter(Boolean);

  if (!llmParts.length) {
    return getTextFromMessageContentParts(normalizedParts, fallbackText);
  }

  const containsStructuredMedia = llmParts.some(
    (part) => part.type === 'image' || part.type === 'audio'
  );
  if (!containsStructuredMedia) {
    return llmParts
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return llmParts;
}

export function setUserMessageText(message, nextText) {
  if (!message || message.role !== 'user') {
    return message;
  }
  const normalizedText = String(nextText || '');
  const normalizedParts = normalizeMessageContentParts(message.content?.parts, normalizedText);
  const nextParts = normalizedParts.filter((part) => part.type !== 'text');
  if (normalizedText.trim()) {
    nextParts.unshift({
      type: 'text',
      text: normalizedText,
    });
  }
  message.text = normalizedText;
  message.content = {
    parts: nextParts,
    llmRepresentation: buildUserMessageLlmRepresentation(nextParts, normalizedText),
  };
  return message;
}

function buildMessagePromptContent(message) {
  if (!message) {
    return '';
  }
  if (message.role === 'tool') {
    return String(message.toolResult ?? message.text ?? '').trim();
  }
  const explicitLlmRepresentation = message?.content?.llmRepresentation;
  if (message.role !== 'user') {
    if (
      explicitLlmRepresentation &&
      typeof explicitLlmRepresentation === 'object' &&
      explicitLlmRepresentation.type === 'text' &&
      typeof explicitLlmRepresentation.text === 'string'
    ) {
      return explicitLlmRepresentation.text.trim();
    }
    if (typeof explicitLlmRepresentation === 'string' && explicitLlmRepresentation.trim()) {
      return explicitLlmRepresentation.trim();
    }
    return String(message?.response || message?.text || '').trim();
  }
  if (Array.isArray(explicitLlmRepresentation)) {
    const normalizedExplicitParts = normalizeMessageContentParts(explicitLlmRepresentation);
    if (normalizedExplicitParts.length) {
      const containsStructuredMedia = normalizedExplicitParts.some(
        (part) => part.type === 'image' || part.type === 'audio'
      );
      if (containsStructuredMedia) {
        return normalizedExplicitParts.map((part) => ({ ...part }));
      }
      return getTextFromMessageContentParts(normalizedExplicitParts, message.text || '').trim();
    }
  }
  if (
    explicitLlmRepresentation &&
    typeof explicitLlmRepresentation === 'object' &&
    explicitLlmRepresentation.type === 'text' &&
    typeof explicitLlmRepresentation.text === 'string'
  ) {
    return explicitLlmRepresentation.text.trim();
  }
  if (typeof explicitLlmRepresentation === 'string' && explicitLlmRepresentation.trim()) {
    return explicitLlmRepresentation.trim();
  }
  const normalizedParts = normalizeMessageContentParts(message.content?.parts, message.text || '');
  if (!normalizedParts.length) {
    return '';
  }
  const llmRepresentation = buildUserMessageLlmRepresentation(normalizedParts, message.text || '');
  if (Array.isArray(llmRepresentation)) {
    return llmRepresentation.map((part) => ({ ...part }));
  }
  if (typeof llmRepresentation === 'string' && llmRepresentation.trim()) {
    return llmRepresentation.trim();
  }
  const containsStructuredMedia = normalizedParts.some(
    (part) => part.type === 'image' || part.type === 'audio'
  );
  if (!containsStructuredMedia) {
    return getTextFromMessageContentParts(normalizedParts, message.text || '').trim();
  }
  return normalizedParts
    .filter((part) => part.type === 'text' || part.type === 'image' || part.type === 'audio')
    .map((part) => ({ ...part }));
}

function normalizeToolCall(rawToolCall) {
  if (!rawToolCall || typeof rawToolCall !== 'object') {
    return null;
  }
  const name = typeof rawToolCall.name === 'string' ? rawToolCall.name.trim() : '';
  if (!name) {
    return null;
  }
  const argumentsValue =
    rawToolCall.arguments && typeof rawToolCall.arguments === 'object' && !Array.isArray(rawToolCall.arguments)
      ? rawToolCall.arguments
      : {};
  const normalized = {
    name,
    arguments: argumentsValue,
  };
  if (typeof rawToolCall.rawText === 'string' && rawToolCall.rawText.trim()) {
    normalized.rawText = rawToolCall.rawText.trim();
  }
  if (typeof rawToolCall.format === 'string' && rawToolCall.format.trim()) {
    normalized.format = rawToolCall.format.trim();
  }
  return normalized;
}

function normalizeToolCalls(rawToolCalls) {
  return Array.isArray(rawToolCalls) ? rawToolCalls.map(normalizeToolCall).filter(Boolean) : [];
}

function toIsoTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : null;
}

function formatUtcTimestamp(value) {
  const dateFromString = typeof value === 'string' && value ? new Date(value) : null;
  const normalizedTimestamp = normalizeTimestamp(value);
  const dateFromTimestamp = normalizedTimestamp ? new Date(normalizedTimestamp) : null;
  const candidateDate =
    dateFromString instanceof Date && Number.isFinite(dateFromString.valueOf())
      ? dateFromString
      : dateFromTimestamp instanceof Date && Number.isFinite(dateFromTimestamp.valueOf())
        ? dateFromTimestamp
        : null;
  if (!candidateDate) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(candidateDate);
}

function formatExportDate(value) {
  const dateFromString = typeof value === 'string' && value ? new Date(value) : null;
  const normalizedTimestamp = normalizeTimestamp(value);
  const dateFromTimestamp = normalizedTimestamp ? new Date(normalizedTimestamp) : null;
  const candidateDate =
    dateFromString instanceof Date && Number.isFinite(dateFromString.valueOf())
      ? dateFromString
      : dateFromTimestamp instanceof Date && Number.isFinite(dateFromTimestamp.valueOf())
        ? dateFromTimestamp
        : null;
  if (!candidateDate) {
    return null;
  }
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(candidateDate);
}

function formatExportTime(value) {
  const dateFromString = typeof value === 'string' && value ? new Date(value) : null;
  const normalizedTimestamp = normalizeTimestamp(value);
  const dateFromTimestamp = normalizedTimestamp ? new Date(normalizedTimestamp) : null;
  const candidateDate =
    dateFromString instanceof Date && Number.isFinite(dateFromString.valueOf())
      ? dateFromString
      : dateFromTimestamp instanceof Date && Number.isFinite(dateFromTimestamp.valueOf())
        ? dateFromTimestamp
        : null;
  if (!candidateDate) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(candidateDate);
}

function toMarkdownBlockquote(text) {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return '> ';
  }
  return normalizedText
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function normalizeSystemPrompt(value) {
  const text = String(value ?? '').trim();
  return text ? text.replace(/\r\n?/g, '\n') : '';
}

export function normalizeConversationPromptMode(value) {
  return value !== false;
}

export function normalizeConversationLanguagePreference(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || normalized === 'auto') {
    return 'auto';
  }
  return normalized.replace(/_/g, '-');
}

export function normalizeConversationThinkingEnabled(value, defaultValue = true) {
  if (value === false) {
    return false;
  }
  if (value === true) {
    return true;
  }
  return defaultValue !== false;
}

export function normalizeConversationType(value) {
  return value === CONVERSATION_TYPES.AGENT
    ? CONVERSATION_TYPES.AGENT
    : CONVERSATION_TYPES.CHAT;
}

function normalizeAgentName(value, fallback = '') {
  const normalizedName = normalizeConversationName(value);
  if (normalizedName) {
    return normalizedName;
  }
  return normalizeConversationName(fallback);
}

function normalizeAgentDescription(value) {
  return normalizeSystemPrompt(value);
}

function normalizeAgentState(agent, conversationName, startedAt) {
  if (!agent || typeof agent !== 'object') {
    return {
      name: normalizeAgentName('', conversationName),
      description: '',
      paused: false,
      lastActivityAt: normalizeTimestamp(startedAt) || Date.now(),
      lastFollowUpAt: null,
      nextFollowUpAt: null,
    };
  }
  const normalizedStartedAt = normalizeTimestamp(startedAt) || Date.now();
  return {
    name: normalizeAgentName(agent.name, conversationName),
    description: normalizeAgentDescription(agent.description),
    paused: agent.paused === true,
    lastActivityAt: normalizeTimestamp(agent.lastActivityAt) || normalizedStartedAt,
    lastFollowUpAt: normalizeTimestamp(agent.lastFollowUpAt),
    nextFollowUpAt: normalizeTimestamp(agent.nextFollowUpAt),
  };
}

export function isAgentConversation(conversation) {
  return normalizeConversationType(conversation?.conversationType) === CONVERSATION_TYPES.AGENT;
}

function formatArtifactInventoryLines(artifactRefs) {
  const normalizedRefs = Array.isArray(artifactRefs) ? artifactRefs : [];
  const lines = [];
  const seenKeys = new Set();
  normalizedRefs.forEach((ref) => {
    if (!ref || typeof ref !== 'object') {
      return;
    }
    const filename = typeof ref.filename === 'string' ? ref.filename.trim() : '';
    const workspacePath = typeof ref.workspacePath === 'string' ? ref.workspacePath.trim() : '';
    if (!filename && !workspacePath) {
      return;
    }
    const key = `${filename}::${workspacePath}`;
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    lines.push(
      workspacePath && filename ? `- ${filename} (${workspacePath})` : `- ${filename || workspacePath}`
    );
  });
  return lines;
}

function buildAgentIdentityPrompt(conversation) {
  if (!isAgentConversation(conversation)) {
    return '';
  }
  const agentName = normalizeAgentName(conversation?.agent?.name, conversation?.name || 'Agent');
  const agentDescription = normalizeAgentDescription(conversation?.agent?.description);
  const parts = [
    '**Agent identity:**',
    `- Your name is ${agentName || 'Agent'}.`,
    '- Stay consistent with this identity while still following the rest of the system instructions.',
    '- You are an agent with a past, present, and future. Remember the past while planning for the future.',
    '- Use the tools available to help the user in whatever way you can.',
    '- Explain why you used a tool to complete your work.',
    "- This is not roleplay. This is real life. Don't act like you did something. Do it.",
    '- Keep a tasklist for longer projects and keep it up-to-date.',
    "- Protect the user's identity and privacy when sending information over the internet.",
    '- Ask permission before taking destructive actions.',
  ];
  if (agentDescription) {
    parts.push('- Personality and behavior:');
    parts.push(agentDescription);
  }
  return parts.join('\n');
}

function buildSummarySystemPromptSection(summaryMessage) {
  if (!summaryMessage || summaryMessage.role !== 'summary') {
    return '';
  }
  const summaryText = normalizeSystemPrompt(summaryMessage.summary || summaryMessage.text);
  if (!summaryText) {
    return '';
  }
  const parts = ['Conversation memory summary:', summaryText];
  const artifactLines = formatArtifactInventoryLines(summaryMessage.artifactRefs);
  if (artifactLines.length) {
    parts.push('Files carried forward from earlier conversation context:');
    parts.push(artifactLines.join('\n'));
  }
  return parts.join('\n\n');
}

function joinSystemPromptSections(parts) {
  return parts
    .map((part) => normalizeSystemPrompt(part))
    .filter(Boolean)
    .join('\n\n');
}

export function getEffectiveConversationSystemPrompt(conversation, { suffix = '' } = {}) {
  const capturedDefaultPrompt = normalizeSystemPrompt(conversation?.systemPrompt);
  const conversationPrompt = normalizeSystemPrompt(conversation?.conversationSystemPrompt);
  const shouldAppendPrompt = normalizeConversationPromptMode(
    conversation?.appendConversationSystemPrompt
  );
  const agentPrompt = buildAgentIdentityPrompt(conversation);
  const basePrompt = (() => {
    if (isAgentConversation(conversation)) {
      return joinSystemPromptSections([capturedDefaultPrompt, agentPrompt]);
    }
    if (!conversationPrompt) {
      return capturedDefaultPrompt;
    }
    if (!shouldAppendPrompt) {
      return conversationPrompt;
    }
    if (!capturedDefaultPrompt) {
      return conversationPrompt;
    }
    return `${capturedDefaultPrompt}\n\n${conversationPrompt}`;
  })();
  return joinSystemPromptSections([basePrompt, suffix]);
}

function normalizeEnabledToolNames(enabledToolNames) {
  const normalizedNames = Array.isArray(enabledToolNames)
    ? enabledToolNames
        .map((toolName) => (typeof toolName === 'string' ? toolName.trim() : ''))
        .filter(Boolean)
    : [];
  return normalizedNames.length ? normalizedNames : ['none'];
}

function buildToolMetadata(toolContext) {
  if (!toolContext?.enabled) {
    return null;
  }
  return {
    supported: toolContext.supported === true,
    enabledTools: normalizeEnabledToolNames(toolContext.enabledTools),
  };
}

/**
 * @param {{
 *   id: string;
 *   name?: string;
 *   untitledPrefix?: string;
 *   modelId?: string;
 *   conversationType?: string;
 *   systemPrompt?: string;
 *   languagePreference?: string;
 *   thinkingEnabled?: boolean;
 *   agent?: {
 *     name?: string;
 *     description?: string;
 *     paused?: boolean;
 *     lastActivityAt?: number;
 *     lastFollowUpAt?: number;
 *     nextFollowUpAt?: number;
 *   } | null;
 *   startedAt?: number;
 * }} [options]
 */
export function createConversation(options) {
  const {
    id,
    name,
    untitledPrefix = 'New Conversation',
    modelId = '',
    conversationType = CONVERSATION_TYPES.CHAT,
    systemPrompt = '',
    languagePreference = 'auto',
    thinkingEnabled = true,
    agent = null,
    startedAt = Date.now(),
  } = options || {};
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Conversation id is required.');
  }
  const normalizedConversationType = normalizeConversationType(conversationType);
  const normalizedName = normalizeConversationName(name || untitledPrefix) || untitledPrefix;
  const normalizedStartedAt = normalizeTimestamp(startedAt) || Date.now();
  return {
    id: id.trim(),
    name: normalizedName,
    modelId: typeof modelId === 'string' ? modelId.trim() : '',
    conversationType: normalizedConversationType,
    systemPrompt: normalizeSystemPrompt(systemPrompt),
    conversationSystemPrompt: '',
    appendConversationSystemPrompt: true,
    languagePreference: normalizeConversationLanguagePreference(languagePreference),
    thinkingEnabled: normalizeConversationThinkingEnabled(thinkingEnabled),
    agent:
      normalizedConversationType === CONVERSATION_TYPES.AGENT
        ? normalizeAgentState(agent, normalizedName, normalizedStartedAt)
        : null,
    startedAt: normalizedStartedAt,
    messageNodes: [],
    messageNodeCounter: 0,
    activeLeafMessageId: null,
    lastSpokenLeafMessageId: null,
    hasGeneratedName: false,
    currentWorkingDirectory: '/workspace',
    shellVariables: {},
  };
}

export function normalizeConversationName(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 64) {
    return trimmed;
  }
  return `${trimmed.slice(0, 61).trimEnd()}...`;
}

export function parseMessageNodeCounterFromId(nodeId) {
  if (typeof nodeId !== 'string') {
    return 0;
  }
  const match = nodeId.match(/-node-(\d+)$/);
  if (!match) {
    return 0;
  }
  const counter = Number.parseInt(match[1], 10);
  return Number.isInteger(counter) && counter > 0 ? counter : 0;
}

function parseMessageSequenceFromNodeId(nodeId) {
  const sequence = parseMessageNodeCounterFromId(nodeId);
  return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}

export function getMessageNodeById(conversation, messageId) {
  if (!conversation || !messageId) {
    return null;
  }
  return conversation.messageNodes.find((message) => message.id === messageId) || null;
}

export function getConversationPathMessages(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId,
) {
  if (!conversation || !leafMessageId) {
    return [];
  }
  const byId = new Map(conversation.messageNodes.map((message) => [message.id, message]));
  const path = [];
  let cursor = byId.get(leafMessageId) || null;
  while (cursor) {
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return path.reverse();
}

export function isMessageDescendantOf(conversation, messageId, ancestorId) {
  if (!conversation || !messageId || !ancestorId) {
    return false;
  }
  let cursor = getMessageNodeById(conversation, messageId);
  while (cursor) {
    if (cursor.id === ancestorId) {
      return true;
    }
    cursor = cursor.parentId ? getMessageNodeById(conversation, cursor.parentId) : null;
  }
  return false;
}

function getVisibleMessageRoleSequence(conversation, message) {
  if (!conversation || !message?.id) {
    return 0;
  }
  let userPromptCount = 0;
  let modelResponseCount = 0;
  let toolResultCount = 0;
  let summaryCount = 0;
  const visiblePath = getConversationPathMessages(conversation);
  for (const pathMessage of visiblePath) {
    if (pathMessage.role === 'user') {
      userPromptCount += 1;
      if (pathMessage.id === message.id) {
        return userPromptCount;
      }
    } else if (pathMessage.role === 'model') {
      modelResponseCount += 1;
      if (pathMessage.id === message.id) {
        return modelResponseCount;
      }
    } else if (pathMessage.role === 'tool') {
      toolResultCount += 1;
      if (pathMessage.id === message.id) {
        return toolResultCount;
      }
    } else if (pathMessage.role === 'summary') {
      summaryCount += 1;
      if (pathMessage.id === message.id) {
        return summaryCount;
      }
    }
  }
  return 0;
}

export function deriveConversationName(conversation) {
  const pathMessages = getConversationPathMessages(conversation);
  const firstUserMessage = pathMessages.find((message) => message.role === 'user')?.text || '';
  const firstModelMessage = pathMessages.find((message) => message.role === 'model')?.text || '';
  const source = `${firstUserMessage} ${firstModelMessage}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return conversation?.name || '';
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
    return conversation?.name || '';
  }

  return normalizeConversationName(topTokens.join(' '));
}

export function deriveConversationMenuCapabilities(conversation) {
  const pathMessages = getConversationPathMessages(conversation);
  const hasCompletedGeneration = pathMessages.some(
    (message) => message?.role === 'model' && Boolean(message.isResponseComplete)
  );
  return {
    canEditName: Boolean(conversation?.hasGeneratedName),
    canEditPrompt: Boolean(conversation),
    canDownload: hasCompletedGeneration,
  };
}

export function getModelSiblingMessages(conversation, modelMessage) {
  if (!conversation || !modelMessage || modelMessage.role !== 'model' || !modelMessage.parentId) {
    return [];
  }
  const parentMessage = getMessageNodeById(conversation, modelMessage.parentId);
  if (!parentMessage || (parentMessage.role !== 'user' && parentMessage.role !== 'tool')) {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'model');
}

export function getUserSiblingMessages(conversation, userMessage) {
  if (!conversation || !userMessage || userMessage.role !== 'user') {
    return [];
  }
  if (!userMessage.parentId) {
    return conversation.messageNodes.filter(
      (candidate) => candidate?.role === 'user' && !candidate.parentId,
    );
  }
  const parentMessage = getMessageNodeById(conversation, userMessage.parentId);
  if (!parentMessage || parentMessage.role !== 'model') {
    return [];
  }
  return (parentMessage.childIds || [])
    .map((childId) => getMessageNodeById(conversation, childId))
    .filter((child) => child?.role === 'user');
}

export function getModelVariantState(conversation, modelMessage) {
  const siblings = getModelSiblingMessages(conversation, modelMessage);
  const index = siblings.findIndex((candidate) => candidate.id === modelMessage.id);
  const total = siblings.length;
  return {
    siblings,
    index,
    total,
    hasVariants: total > 1,
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < total - 1,
  };
}

export function getUserVariantState(conversation, userMessage) {
  const siblings = getUserSiblingMessages(conversation, userMessage);
  const index = siblings.findIndex((candidate) => candidate.id === userMessage.id);
  const total = siblings.length;
  return {
    siblings,
    index,
    total,
    hasVariants: total > 1,
    canGoPrev: index > 0,
    canGoNext: index >= 0 && index < total - 1,
  };
}

export function getConversationCardHeading(conversation, message) {
  if (!conversation || !message) {
    return '';
  }
  const baseLabel =
    message.role === 'user'
      ? 'User Prompt'
      : message.role === 'summary'
        ? 'Conversation Summary'
      : message.role === 'tool'
        ? 'Tool Result'
        : 'Model Response';
  if (message.role === 'tool' || message.role === 'summary') {
    const sequence = Math.max(getVisibleMessageRoleSequence(conversation, message), 1);
    return `${baseLabel} ${sequence}`;
  }
  const sequence = Math.max(getVisibleMessageRoleSequence(conversation, message), 1);
  const variantState =
    message.role === 'user'
      ? getUserVariantState(conversation, message)
      : getModelVariantState(conversation, message);
  const hasBranch = variantState.total > 1;
  const branchIndex = Math.max(variantState.index + 1, 1);
  return hasBranch
    ? `${baseLabel} ${sequence}, Branch ${branchIndex}`
    : `${baseLabel} ${sequence}`;
}

export function addMessageToConversation(conversation, role, text, options = {}) {
  const normalizedRole =
    role === 'user'
      ? 'user'
      : role === 'tool'
        ? 'tool'
        : role === 'summary'
          ? 'summary'
          : 'model';
  const normalizedText = String(text || '');
  const hasExplicitParentId = Object.prototype.hasOwnProperty.call(options, 'parentId');
  const requestedParentId = hasExplicitParentId
    ? typeof options.parentId === 'string' && options.parentId.trim()
      ? options.parentId.trim()
      : null
    : conversation.activeLeafMessageId;
  const parentId =
    requestedParentId && getMessageNodeById(conversation, requestedParentId) ? requestedParentId : null;
  const message = {
    id: `${conversation.id}-node-${++conversation.messageNodeCounter}`,
    role: normalizedRole,
    speaker:
      normalizedRole === 'user'
        ? 'User'
        : normalizedRole === 'tool'
          ? 'Tool'
          : normalizedRole === 'summary'
            ? 'Summary'
            : 'Model',
    text: normalizedText,
    createdAt: normalizeTimestamp(options.createdAt) || Date.now(),
    parentId: parentId || null,
    childIds: [],
  };
  if (normalizedRole === 'user') {
    message.content = {
      parts: normalizeMessageContentParts(options.contentParts, normalizedText),
      llmRepresentation: null,
    };
    message.artifactRefs = normalizeMessageArtifactRefs(options.artifactRefs);
    setUserMessageText(message, normalizedText);
  }
  if (normalizedRole === 'model') {
    message.thoughts = '';
    message.response = normalizedText;
    message.rawStreamText = normalizedText;
    message.hasThinking = false;
    message.isThinkingComplete = false;
    message.isResponseComplete = false;
    message.content = {
      parts: normalizeMessageContentParts(
        options.contentParts,
        typeof options.response === 'string' ? options.response : normalizedText,
      ),
      llmRepresentation:
        typeof options.response === 'string' ? options.response : normalizedText,
    };
    message.artifactRefs = normalizeMessageArtifactRefs(options.artifactRefs);
    message.toolCalls = normalizeToolCalls(options.toolCalls);
  }
  if (normalizedRole === 'tool') {
    message.toolName = typeof options.toolName === 'string' ? options.toolName.trim() : '';
    message.toolArguments =
      options.toolArguments && typeof options.toolArguments === 'object' && !Array.isArray(options.toolArguments)
        ? options.toolArguments
        : {};
    message.toolResultData =
      options.toolResultData &&
      typeof options.toolResultData === 'object' &&
      !Array.isArray(options.toolResultData)
        ? options.toolResultData
        : undefined;
    message.toolResult = normalizedText;
    message.isToolResultComplete = true;
    message.content = {
      parts: normalizeMessageContentParts(options.contentParts, normalizedText),
      llmRepresentation: normalizedText,
    };
    message.artifactRefs = normalizeMessageArtifactRefs(options.artifactRefs);
  }
  if (normalizedRole === 'summary') {
    message.summary = normalizedText;
    message.isSummaryNode = true;
    message.content = {
      parts: normalizeMessageContentParts(options.contentParts, normalizedText),
      llmRepresentation: normalizedText,
    };
    message.artifactRefs = normalizeMessageArtifactRefs(options.artifactRefs);
  }
  conversation.messageNodes.push(message);
  if (parentId) {
    const parentMessage = getMessageNodeById(conversation, parentId);
    if (parentMessage && Array.isArray(parentMessage.childIds)) {
      parentMessage.childIds.push(message.id);
    }
  }
  conversation.activeLeafMessageId = message.id;
  return message;
}

export function pruneDescendantsFromMessage(conversation, messageId) {
  if (!conversation || !messageId) {
    return { removedIds: [], removedCount: 0 };
  }
  const rootMessage = getMessageNodeById(conversation, messageId);
  if (!rootMessage) {
    return { removedIds: [], removedCount: 0 };
  }
  const idsToRemove = new Set();
  const stack = Array.isArray(rootMessage.childIds) ? [...rootMessage.childIds] : [];
  while (stack.length) {
    const candidateId = stack.pop();
    if (!candidateId || idsToRemove.has(candidateId)) {
      continue;
    }
    const candidateMessage = getMessageNodeById(conversation, candidateId);
    if (!candidateMessage) {
      continue;
    }
    idsToRemove.add(candidateId);
    (candidateMessage.childIds || []).forEach((childId) => {
      if (!idsToRemove.has(childId)) {
        stack.push(childId);
      }
    });
  }
  if (!idsToRemove.size) {
    return { removedIds: [], removedCount: 0 };
  }
  conversation.messageNodes = conversation.messageNodes.filter((message) => !idsToRemove.has(message.id));
  conversation.messageNodes.forEach((message) => {
    message.childIds = Array.isArray(message.childIds)
      ? message.childIds.filter((childId) => !idsToRemove.has(childId))
      : [];
  });
  rootMessage.childIds = [];
  if (idsToRemove.has(conversation.activeLeafMessageId)) {
    conversation.activeLeafMessageId = rootMessage.id;
  }
  if (idsToRemove.has(conversation.lastSpokenLeafMessageId)) {
    conversation.lastSpokenLeafMessageId = rootMessage.id;
  }
  return {
    removedIds: [...idsToRemove],
    removedCount: idsToRemove.size,
  };
}

export function findPreferredLeafForVariant(conversation, variantMessage) {
  if (!conversation || !variantMessage) {
    return null;
  }
  const activeLeafId = conversation.activeLeafMessageId;
  if (activeLeafId && isMessageDescendantOf(conversation, activeLeafId, variantMessage.id)) {
    return activeLeafId;
  }
  const lastSpokenLeafId = conversation.lastSpokenLeafMessageId;
  if (lastSpokenLeafId && isMessageDescendantOf(conversation, lastSpokenLeafId, variantMessage.id)) {
    return lastSpokenLeafId;
  }

  const stack = [variantMessage.id];
  let preferredLeafId = variantMessage.id;
  let preferredLeafSequence = parseMessageSequenceFromNodeId(preferredLeafId);
  while (stack.length) {
    const currentId = stack.pop();
    const currentMessage = getMessageNodeById(conversation, currentId);
    if (!currentMessage) {
      continue;
    }
    const childIds = Array.isArray(currentMessage.childIds) ? currentMessage.childIds : [];
    if (!childIds.length) {
      const currentSequence = parseMessageSequenceFromNodeId(currentMessage.id);
      if (currentSequence >= preferredLeafSequence) {
        preferredLeafId = currentMessage.id;
        preferredLeafSequence = currentSequence;
      }
      continue;
    }
    childIds.forEach((childId) => {
      stack.push(childId);
    });
  }
  return preferredLeafId;
}

export function buildConversationMessages(messages, systemPrompt = '') {
  const structuredMessages = [];
  const normalizedSystemPrompt = normalizeSystemPrompt(systemPrompt);
  if (normalizedSystemPrompt) {
    structuredMessages.push({
      role: 'system',
      content: normalizedSystemPrompt,
    });
  }
  messages.forEach((message) => {
    if (
      !message ||
      (message.role !== 'user' &&
        message.role !== 'model' &&
        message.role !== 'tool' &&
        message.role !== 'summary')
    ) {
      return;
    }
    if (message.role === 'summary') {
      return;
    }
    const content = buildMessagePromptContent(message);
    const isStructuredContent = Array.isArray(content);
    if ((!isStructuredContent && !String(content || '').trim()) || (isStructuredContent && !content.length)) {
      return;
    }
    structuredMessages.push({
      role: message.role === 'user' ? 'user' : message.role === 'tool' ? 'tool' : 'assistant',
      content,
      ...(message.role === 'tool' &&
      typeof message.toolName === 'string' &&
      message.toolName.trim()
        ? { toolName: message.toolName.trim() }
        : {}),
    });
  });
  return structuredMessages;
}

export function buildPromptForConversationLeaf(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId,
  { systemPromptSuffix = '' } = {},
) {
  const pathMessages = getConversationPathMessages(conversation, leafMessageId);
  const lastSummaryIndex = pathMessages.reduce(
    (latestIndex, message, index) => (message?.role === 'summary' ? index : latestIndex),
    -1
  );
  const summaryMessage = lastSummaryIndex >= 0 ? pathMessages[lastSummaryIndex] : null;
  const promptMessages =
    lastSummaryIndex >= 0 ? pathMessages.slice(lastSummaryIndex + 1) : pathMessages;
  const combinedSuffix = [buildSummarySystemPromptSection(summaryMessage), systemPromptSuffix]
    .map((part) => normalizeSystemPrompt(part))
    .filter(Boolean)
    .join('\n\n');
  return buildConversationMessages(
    promptMessages,
    getEffectiveConversationSystemPrompt(conversation, { suffix: combinedSuffix }),
  );
}

function normalizeTaskListItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      if (!text) {
        return null;
      }
      return {
        text,
        status: entry.status === 1 || entry.status === true ? 1 : 0,
      };
    })
    .filter(Boolean);
}

function getTaskListItemsFromToolMessage(message) {
  if (message?.role !== 'tool' || message.toolName !== 'tasklist') {
    return null;
  }
  if (Array.isArray(message?.toolResultData?.items)) {
    return normalizeTaskListItems(message.toolResultData.items);
  }
  try {
    const parsed = JSON.parse(String(message.toolResult || message.text || ''));
    return Array.isArray(parsed?.items) ? normalizeTaskListItems(parsed.items) : null;
  } catch {
    return null;
  }
}

export function getTaskListForConversationLeaf(
  conversation,
  leafMessageId = conversation?.activeLeafMessageId,
) {
  const pathMessages = getConversationPathMessages(conversation, leafMessageId);
  for (let index = pathMessages.length - 1; index >= 0; index -= 1) {
    const taskListItems = getTaskListItemsFromToolMessage(pathMessages[index]);
    if (taskListItems) {
      return taskListItems;
    }
  }
  return [];
}

export function buildConversationDownloadPayload(
  conversation,
  {
    modelId = conversation?.modelId || 'Unknown',
    temperature = null,
    exportedAt = new Date().toISOString(),
    systemPromptSuffix = '',
    toolContext = null,
  } = {},
) {
  const startedAt = normalizeTimestamp(conversation?.startedAt);
  const exchanges = getConversationPathMessages(conversation)
    .filter(
      (message) =>
        message?.role === 'user' ||
        message?.role === 'model' ||
        message?.role === 'tool' ||
        message?.role === 'summary'
    )
    .map((message, index) => {
      const exchangeNumber = index + 1;
      if (message.role === 'user') {
        const timestamp = toIsoTimestamp(message.createdAt);
        const timestampMs = normalizeTimestamp(message.createdAt);
        return {
          heading: `User prompt ${exchangeNumber}`,
          role: message.role,
          event: 'entered',
          timestamp,
          timestampMs,
          createdAt: timestamp,
          createdAtMs: timestampMs,
          date: formatExportDate(timestamp),
          time: formatExportTime(timestamp),
          text: String(message.text || ''),
        };
      }
      if (message.role === 'tool') {
        const timestamp = toIsoTimestamp(message.createdAt);
        const timestampMs = normalizeTimestamp(message.createdAt);
        return {
          heading: `Tool result ${exchangeNumber}`,
          role: message.role,
          event: 'tool_result',
          timestamp,
          timestampMs,
          createdAt: timestamp,
          createdAtMs: timestampMs,
          date: formatExportDate(timestamp),
          time: formatExportTime(timestamp),
          text: String(message.toolResult || message.text || ''),
          toolName: typeof message.toolName === 'string' ? message.toolName : '',
          toolArguments: message.toolArguments && typeof message.toolArguments === 'object' ? message.toolArguments : {},
          toolResultData:
            message.toolResultData && typeof message.toolResultData === 'object'
              ? message.toolResultData
              : undefined,
        };
      }
      if (message.role === 'summary') {
        const timestamp = toIsoTimestamp(message.createdAt);
        const timestampMs = normalizeTimestamp(message.createdAt);
        return {
          heading: `Conversation summary ${exchangeNumber}`,
          role: message.role,
          event: 'summary',
          timestamp,
          timestampMs,
          createdAt: timestamp,
          createdAtMs: timestampMs,
          date: formatExportDate(timestamp),
          time: formatExportTime(timestamp),
          text: String(message.summary || message.text || ''),
          artifactRefs: normalizeMessageArtifactRefs(message.artifactRefs),
        };
      }
      const timestamp = toIsoTimestamp(message.createdAt);
      const timestampMs = normalizeTimestamp(message.createdAt);
      return {
        heading: `Model response ${exchangeNumber}`,
        role: message.role,
        event: 'generated',
        timestamp,
        timestampMs,
        createdAt: timestamp,
        createdAtMs: timestampMs,
        date: formatExportDate(timestamp),
        time: formatExportTime(timestamp),
        text: String(message.response || message.text || ''),
        toolCalls: normalizeToolCalls(message.toolCalls),
      };
    });
  const payload = {
    conversation: {
      name: String(conversation?.name || ''),
      startedAt: toIsoTimestamp(startedAt),
      startedAtMs: startedAt,
      exportedAt,
    },
    model: modelId,
    temperature,
    exchanges,
  };
  const systemPrompt = getEffectiveConversationSystemPrompt(conversation, {
    suffix: systemPromptSuffix,
  });
  if (systemPrompt) {
    payload.systemPrompt = systemPrompt;
  }
  const toolMetadata = buildToolMetadata(toolContext);
  if (toolMetadata) {
    payload.toolCalling = toolMetadata;
  }
  return payload;
}

function buildConversationDownloadFileName(conversationName) {
  const normalizedName = String(conversationName || 'conversation').trim() || 'conversation';
  return (
    normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'conversation'
  );
}

export function buildConversationJsonDownloadFileName(conversationName) {
  return `${buildConversationDownloadFileName(conversationName)}.llm.json`;
}

export function buildConversationMarkdownDownloadFileName(conversationName) {
  return `${buildConversationDownloadFileName(conversationName)}.md`;
}

export function buildConversationDownloadMarkdown(payload) {
  const lines = [];
  lines.push(`# ${String(payload?.conversation?.name || 'Conversation')}`);
  lines.push('');
  lines.push(`- Started At: ${formatUtcTimestamp(payload?.conversation?.startedAt)}`);
  lines.push(`- Exported At: ${formatUtcTimestamp(payload?.conversation?.exportedAt)}`);
  lines.push(`- Model: ${String(payload?.model || 'Unknown')}`);
  lines.push(`- Temperature: ${Number.isFinite(payload?.temperature) ? payload.temperature : 'Unknown'}`);
  const toolCalling = payload?.toolCalling;
  if (toolCalling && typeof toolCalling === 'object') {
    lines.push(`- Tool Calling Supported: ${toolCalling.supported ? 'Yes' : 'No'}`);
    lines.push(
      `- Enabled Tools: ${
        Array.isArray(toolCalling.enabledTools) && toolCalling.enabledTools.length
          ? toolCalling.enabledTools.join(', ')
          : 'none'
      }`
    );
  }
  lines.push('');
  const systemPrompt = normalizeSystemPrompt(payload?.systemPrompt);
  if (systemPrompt) {
    lines.push('## System prompt');
    lines.push('');
    lines.push(toMarkdownBlockquote(systemPrompt));
    lines.push('');
  }
  const exchanges = Array.isArray(payload?.exchanges) ? payload.exchanges : [];
  exchanges.forEach((exchange) => {
    lines.push(`## ${String(exchange?.heading || 'Exchange')}`);
    const exchangeDate = typeof exchange?.date === 'string' ? exchange.date : null;
    const exchangeTime = typeof exchange?.time === 'string' ? exchange.time : null;
    if (exchangeDate && exchangeTime) {
      lines.push(`Date: ${exchangeDate}`);
      lines.push(`Time: ${exchangeTime}`);
    } else {
      lines.push(formatUtcTimestamp(exchange?.timestamp));
    }
    if (exchange?.role === 'tool' && exchange?.toolName) {
      lines.push('');
      lines.push(`Tool: ${exchange.toolName}`);
      if (exchange.toolArguments && typeof exchange.toolArguments === 'object') {
        lines.push(`Arguments: ${JSON.stringify(exchange.toolArguments)}`);
      }
      if (exchange.toolResultData && typeof exchange.toolResultData === 'object') {
        lines.push(`Tool Result Data: ${JSON.stringify(exchange.toolResultData)}`);
      }
    }
    if (exchange?.role === 'model' && Array.isArray(exchange.toolCalls) && exchange.toolCalls.length) {
      lines.push('');
      lines.push(`Tool Calls: ${JSON.stringify(exchange.toolCalls)}`);
    }
    if (exchange?.role === 'summary') {
      const summaryFiles = Array.isArray(exchange.artifactRefs)
        ? formatArtifactInventoryLines(exchange.artifactRefs)
        : [];
      if (summaryFiles.length) {
        lines.push('');
        lines.push('Files carried forward:');
        lines.push(...summaryFiles);
      }
    }
    lines.push('');
    lines.push(toMarkdownBlockquote(exchange?.text || ''));
    lines.push('');
  });
  return lines.join('\n');
}
