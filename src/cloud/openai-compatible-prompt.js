function flattenContentPart(part) {
  if (!part || typeof part !== 'object') {
    return '';
  }
  if (part.type === 'text') {
    return typeof part.text === 'string' ? part.text : '';
  }
  if (part.type === 'image') {
    return `[Image attachment${part.filename ? `: ${part.filename}` : ''} omitted for this remote model.]`;
  }
  if (part.type === 'audio') {
    return `[Audio attachment${part.filename ? `: ${part.filename}` : ''} omitted for this remote model.]`;
  }
  if (part.type === 'video') {
    return `[Video attachment${part.filename ? `: ${part.filename}` : ''} omitted for this remote model.]`;
  }
  if (part.type === 'file') {
    const fileName = typeof part.filename === 'string' && part.filename.trim() ? part.filename.trim() : 'file';
    const llmText = typeof part.llmText === 'string' ? part.llmText.trim() : '';
    if (llmText) {
      return llmText;
    }
    return `[File attachment: ${fileName}]`;
  }
  return '';
}

export function flattenPromptMessageContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map(flattenContentPart)
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function estimateMessageTokens(message) {
  const text = flattenPromptMessageContent(message?.content);
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4) + 6);
}

function normalizePromptMessageRole(message) {
  const role = typeof message?.role === 'string' ? message.role.trim().toLowerCase() : '';
  if (role === 'system' || role === 'user' || role === 'assistant') {
    return role;
  }
  if (role === 'tool') {
    return 'assistant';
  }
  return 'user';
}

function normalizePromptMessage(message) {
  const content = flattenPromptMessageContent(message?.content);
  if (!content) {
    return null;
  }
  if (message?.role === 'tool') {
    const toolName =
      typeof message?.toolName === 'string' && message.toolName.trim()
        ? message.toolName.trim()
        : 'tool';
    return {
      role: 'assistant',
      content: `[Tool result: ${toolName}]\n${content}`,
    };
  }
  return {
    role: normalizePromptMessageRole(message),
    content,
  };
}

export function normalizeOpenAiCompatiblePromptMessages(
  prompt,
  { maxContextTokens = 0, maxOutputTokens = 0 } = {}
) {
  const normalizedMessages = (Array.isArray(prompt) ? prompt : [])
    .map(normalizePromptMessage)
    .filter(Boolean);
  if (!normalizedMessages.length || !Number.isFinite(maxContextTokens) || maxContextTokens <= 0) {
    return normalizedMessages;
  }

  const reservedOutputTokens =
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? Math.trunc(maxOutputTokens) : 0;
  const promptBudget = Math.max(1, Math.trunc(maxContextTokens) - reservedOutputTokens);
  const systemMessages = normalizedMessages.filter((message) => message.role === 'system');
  const nonSystemMessages = normalizedMessages.filter((message) => message.role !== 'system');
  const keptMessages = [];
  let usedTokens = systemMessages.reduce((total, message) => total + estimateMessageTokens(message), 0);

  for (let index = nonSystemMessages.length - 1; index >= 0; index -= 1) {
    const message = nonSystemMessages[index];
    const estimatedTokens = estimateMessageTokens(message);
    if (keptMessages.length > 0 && usedTokens + estimatedTokens > promptBudget) {
      continue;
    }
    keptMessages.unshift(message);
    usedTokens += estimatedTokens;
  }

  return [...systemMessages, ...keptMessages];
}

function extractStreamTextFromDelta(delta) {
  if (typeof delta?.content === 'string') {
    return delta.content;
  }
  if (Array.isArray(delta?.content)) {
    return delta.content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry?.type === 'text' && typeof entry.text === 'string') {
          return entry.text;
        }
        if (entry?.type === 'output_text' && typeof entry.text === 'string') {
          return entry.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

export function extractOpenAiCompatibleStreamText(chunk) {
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : null;
  if (!choice) {
    return '';
  }
  const deltaText = extractStreamTextFromDelta(choice.delta);
  if (deltaText) {
    return deltaText;
  }
  if (typeof choice.text === 'string') {
    return choice.text;
  }
  return '';
}

export function extractOpenAiCompatibleResponseText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  if (!choice) {
    return '';
  }
  if (typeof choice?.message?.content === 'string') {
    return choice.message.content;
  }
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry?.type === 'text' && typeof entry.text === 'string') {
          return entry.text;
        }
        return '';
      })
      .join('');
  }
  if (typeof choice.text === 'string') {
    return choice.text;
  }
  return '';
}
