import { normalizeModelId } from '../config/model-settings.js';
import { normalizeWorkspacePath } from '../workspace/workspace-file-system.js';
import {
  getConversationPathMessages,
  getTextFromMessageContentParts,
  normalizeConversationName,
  normalizeConversationPromptMode,
  normalizeMessageContentParts,
  normalizeSystemPrompt,
  parseMessageNodeCounterFromId,
  setUserMessageText,
} from './conversation-model.js';

export const CONVERSATION_COLLECTION_FORMAT = 'browser-llm-runner.conversation-collection';
export const CONVERSATION_SCHEMA_VERSION = 6;

function normalizeTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

function normalizeConversationWorkingDirectory(value) {
  try {
    return normalizeWorkspacePath(value);
  } catch {
    return '/workspace';
  }
}

function parseConversationCounterFromId(conversationId) {
  if (typeof conversationId !== 'string') {
    return 0;
  }
  const match = conversationId.match(/^conversation-(\d+)$/);
  if (!match) {
    return 0;
  }
  const counter = Number.parseInt(match[1], 10);
  return Number.isInteger(counter) && counter > 0 ? counter : 0;
}

function isLegacyUntitledConversationName(name) {
  return /^new conversation(?:\s+\d+)?$/i.test(String(name || '').trim());
}

function isLegacyNumberedUntitledConversationName(name) {
  return /^new conversation\s+\d+$/i.test(String(name || '').trim());
}

function buildStoredArtifactLookup(rawState) {
  const artifactMap = new Map();
  const rawArtifacts = Array.isArray(rawState?.artifacts) ? rawState.artifacts : [];
  rawArtifacts.forEach((artifact) => {
    if (
      !artifact ||
      typeof artifact !== 'object' ||
      typeof artifact.id !== 'string' ||
      !artifact.id.trim()
    ) {
      return;
    }
    artifactMap.set(artifact.id.trim(), artifact);
  });
  return artifactMap;
}

function coerceStoredMessageContentParts(rawMessage, artifactLookup) {
  const rawParts = Array.isArray(rawMessage?.content?.parts) ? rawMessage.content.parts : [];
  return normalizeMessageContentParts(rawParts).map((part) => {
    if (part.type !== 'image') {
      if (part.type !== 'file') {
        return part;
      }
      const artifact =
        typeof part.artifactId === 'string' && part.artifactId.trim()
          ? artifactLookup.get(part.artifactId.trim()) || null
          : null;
      const mimeType =
        typeof part.mimeType === 'string' && part.mimeType.trim()
          ? part.mimeType.trim()
          : typeof artifact?.mimeType === 'string' && artifact.mimeType.trim()
            ? artifact.mimeType.trim()
            : '';
      const text =
        typeof part.text === 'string'
          ? part.text
          : typeof artifact?.data === 'string'
            ? artifact.data
            : '';
      const normalizedText =
        typeof part.normalizedText === 'string'
          ? part.normalizedText
          : text;
      return {
        ...part,
        ...(mimeType ? { mimeType } : {}),
        ...(text ? { text } : {}),
        ...(normalizedText ? { normalizedText } : {}),
        ...(typeof part.workspacePath === 'string' && part.workspacePath.trim()
          ? { workspacePath: part.workspacePath.trim() }
          : typeof artifact?.workspacePath === 'string' && artifact.workspacePath.trim()
            ? { workspacePath: artifact.workspacePath.trim() }
            : {}),
      };
    }
    const artifact =
      typeof part.artifactId === 'string' && part.artifactId.trim()
        ? artifactLookup.get(part.artifactId.trim()) || null
        : null;
    const mimeType =
      typeof part.mimeType === 'string' && part.mimeType.trim()
        ? part.mimeType.trim()
        : typeof artifact?.mimeType === 'string' && artifact.mimeType.trim()
          ? artifact.mimeType.trim()
          : '';
    const base64 =
      typeof part.base64 === 'string' && part.base64.trim()
        ? part.base64.trim()
        : typeof artifact?.data === 'string' && artifact.data.trim()
          ? artifact.data.trim()
          : '';
    const url =
      typeof part.url === 'string' && part.url.trim()
        ? part.url.trim()
        : mimeType && base64
          ? `data:${mimeType};base64,${base64}`
          : '';
    return {
      ...part,
      ...(mimeType ? { mimeType } : {}),
      ...(base64 ? { base64 } : {}),
      ...(url ? { url } : {}),
      ...(typeof part.workspacePath === 'string' && part.workspacePath.trim()
        ? { workspacePath: part.workspacePath.trim() }
        : typeof artifact?.workspacePath === 'string' && artifact.workspacePath.trim()
          ? { workspacePath: artifact.workspacePath.trim() }
          : {}),
    };
  });
}

function coerceStoredMessage(rawMessage, fallbackMessageId, artifactLookup = new Map()) {
  if (!rawMessage || typeof rawMessage !== 'object') {
    return null;
  }
  const role =
    rawMessage.role === 'user'
      ? 'user'
      : rawMessage.role === 'model'
        ? 'model'
        : rawMessage.role === 'tool'
          ? 'tool'
          : '';
  if (!role) {
    return null;
  }

  const id =
    typeof rawMessage.id === 'string' && rawMessage.id.trim()
      ? rawMessage.id.trim()
      : fallbackMessageId;
  const contentParts = coerceStoredMessageContentParts(rawMessage, artifactLookup);
  const firstTextPart = contentParts.find(
    (part) => part?.type === 'text' && typeof part.text === 'string',
  );
  const llmText =
    typeof rawMessage.content?.llmRepresentation?.text === 'string'
      ? rawMessage.content.llmRepresentation.text
      : '';
  const text = String(rawMessage.text || rawMessage.response || firstTextPart?.text || llmText || '');
  const message = {
    id,
    role,
    speaker: role === 'user' ? 'User' : role === 'tool' ? 'Tool' : 'Model',
    text,
    createdAt: normalizeTimestamp(rawMessage.createdAt ?? rawMessage.timestamp),
    content: {
      parts: contentParts,
      llmRepresentation: rawMessage.content?.llmRepresentation || null,
    },
    artifactRefs: Array.isArray(rawMessage.artifactRefs)
      ? rawMessage.artifactRefs
          .map((ref) => {
            if (!ref || typeof ref !== 'object' || typeof ref.id !== 'string' || !ref.id.trim()) {
              return null;
            }
            return {
              id: ref.id.trim(),
              kind: typeof ref.kind === 'string' ? ref.kind : 'binary',
              mimeType: typeof ref.mimeType === 'string' ? ref.mimeType : undefined,
              filename: typeof ref.filename === 'string' ? ref.filename : undefined,
              workspacePath:
                typeof ref.workspacePath === 'string' ? ref.workspacePath : undefined,
              hash:
                ref.hash && typeof ref.hash === 'object'
                  ? {
                      algorithm: ref.hash.algorithm,
                      value: ref.hash.value,
                    }
                  : undefined,
            };
          })
          .filter(Boolean)
      : [],
  };

  if (role === 'model') {
    message.thoughts = typeof rawMessage.thoughts === 'string' ? rawMessage.thoughts : '';
    message.response = String(
      rawMessage.response ||
        rawMessage.inference?.output?.verbatimText ||
        rawMessage.content?.llmRepresentation?.text ||
        text,
    );
    message.hasThinking = Boolean(rawMessage.hasThinking || message.thoughts.trim());
    message.isThinkingComplete = Boolean(rawMessage.isThinkingComplete);
    message.isResponseComplete = Boolean(
      rawMessage.isResponseComplete ?? rawMessage.inference?.status?.complete ?? true,
    );
    message.text = message.response;
    message.toolCalls = Array.isArray(rawMessage.toolCalls)
      ? rawMessage.toolCalls
          .map((toolCall) => {
            if (!toolCall || typeof toolCall !== 'object') {
              return null;
            }
            const name = typeof toolCall.name === 'string' ? toolCall.name.trim() : '';
            if (!name) {
              return null;
            }
            return {
              name,
              arguments:
                toolCall.arguments &&
                typeof toolCall.arguments === 'object' &&
                !Array.isArray(toolCall.arguments)
                  ? toolCall.arguments
                  : {},
              rawText: typeof toolCall.rawText === 'string' ? toolCall.rawText : undefined,
              format: typeof toolCall.format === 'string' ? toolCall.format : undefined,
            };
          })
          .filter(Boolean)
      : [];
  } else if (role === 'tool') {
    message.toolName = typeof rawMessage.toolName === 'string' ? rawMessage.toolName : '';
    message.toolArguments =
      rawMessage.toolArguments &&
      typeof rawMessage.toolArguments === 'object' &&
      !Array.isArray(rawMessage.toolArguments)
        ? rawMessage.toolArguments
        : {};
    message.toolResult = String(rawMessage.toolResult || text);
    message.isToolResultComplete = Boolean(rawMessage.isToolResultComplete ?? true);
    message.text = message.toolResult;
  } else {
    message.text = String(
      rawMessage.inference?.input?.verbatimText ||
        rawMessage.content?.llmRepresentation?.text ||
        getTextFromMessageContentParts(contentParts, message.text) ||
        message.text,
    );
    setUserMessageText(message, message.text);
  }

  return message;
}

function coerceStoredMessageNode(rawMessage, fallbackMessageId, artifactLookup) {
  const message = coerceStoredMessage(rawMessage, fallbackMessageId, artifactLookup);
  if (!message) {
    return null;
  }
  message.parentId =
    typeof rawMessage.parentId === 'string' && rawMessage.parentId.trim()
      ? rawMessage.parentId.trim()
      : null;
  message.childIds = Array.isArray(rawMessage.childIds)
    ? rawMessage.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
    : [];
  return message;
}

function serializeMessageArtifactRefs(message) {
  return Array.isArray(message.artifactRefs)
    ? message.artifactRefs
        .map((ref) => {
          if (!ref || typeof ref !== 'object' || typeof ref.id !== 'string' || !ref.id.trim()) {
            return null;
          }
          return {
            id: ref.id.trim(),
            kind: typeof ref.kind === 'string' ? ref.kind : undefined,
            mimeType: typeof ref.mimeType === 'string' ? ref.mimeType : undefined,
            filename: typeof ref.filename === 'string' ? ref.filename : undefined,
            workspacePath:
              typeof ref.workspacePath === 'string' ? ref.workspacePath : undefined,
            hash:
              ref.hash && typeof ref.hash === 'object'
                ? {
                    algorithm: ref.hash.algorithm,
                    value: ref.hash.value,
                  }
                : undefined,
          };
        })
        .filter(Boolean)
    : [];
}

function serializeMessageContent(message) {
  const contentParts = normalizeMessageContentParts(message.content?.parts, message.text || '').map((part) =>
    part.type === 'image'
      ? {
          type: 'image',
          artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
          mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
          filename: typeof part.filename === 'string' ? part.filename : undefined,
          workspacePath:
            typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
          width: Number.isFinite(part.width) ? part.width : undefined,
          height: Number.isFinite(part.height) ? part.height : undefined,
          alt: typeof part.alt === 'string' ? part.alt : undefined,
          base64: typeof part.base64 === 'string' ? part.base64 : undefined,
          url: typeof part.url === 'string' ? part.url : undefined,
        }
      : part.type === 'file'
        ? {
            type: 'file',
            artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
            mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
            filename: typeof part.filename === 'string' ? part.filename : undefined,
            workspacePath:
              typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
            extension: typeof part.extension === 'string' ? part.extension : undefined,
            size: Number.isFinite(part.size) ? part.size : undefined,
            pageCount: Number.isFinite(part.pageCount) ? part.pageCount : undefined,
            text: typeof part.text === 'string' ? part.text : undefined,
            normalizedText: typeof part.normalizedText === 'string' ? part.normalizedText : undefined,
            normalizedFormat:
              typeof part.normalizedFormat === 'string' ? part.normalizedFormat : undefined,
            conversionWarnings: Array.isArray(part.conversionWarnings)
              ? part.conversionWarnings.filter((warning) => typeof warning === 'string' && warning.trim())
              : undefined,
            memoryHint:
              part.memoryHint && typeof part.memoryHint === 'object'
                ? {
                    ingestible: part.memoryHint.ingestible === true ? true : undefined,
                    preferredSource:
                      typeof part.memoryHint.preferredSource === 'string'
                        ? part.memoryHint.preferredSource
                        : undefined,
                    documentRole:
                      typeof part.memoryHint.documentRole === 'string'
                        ? part.memoryHint.documentRole
                        : undefined,
                  }
                : undefined,
            llmText: typeof part.llmText === 'string' ? part.llmText : undefined,
          }
      : {
          type: 'text',
          text: String(part.text || ''),
        },
  );
  return {
    parts: contentParts,
    llmRepresentation:
      message.role === 'model'
        ? {
            type: 'text',
            text: typeof message.response === 'string' ? message.response : String(message.text || ''),
          }
        : Array.isArray(message.content?.llmRepresentation)
          ? message.content.llmRepresentation
          : typeof message.content?.llmRepresentation === 'string'
            ? {
                type: 'text',
                text: message.content.llmRepresentation,
              }
            : message.content?.llmRepresentation &&
                typeof message.content.llmRepresentation === 'object' &&
                message.content.llmRepresentation.type === 'text'
              ? message.content.llmRepresentation
          : contentParts.some((part) => part.type === 'image')
            ? contentParts
            : {
                type: 'text',
                text: String(getTextFromMessageContentParts(contentParts, message.text || '') || ''),
              },
  };
}

function serializeConversationMessage(message) {
  return {
    id: message.id,
    role: message.role,
    speaker: message.speaker,
    text: String(message.text || ''),
    createdAt: normalizeTimestamp(message.createdAt),
    thoughts: typeof message.thoughts === 'string' ? message.thoughts : '',
    response: typeof message.response === 'string' ? message.response : String(message.text || ''),
    hasThinking: Boolean(message.hasThinking),
    isThinkingComplete: Boolean(message.isThinkingComplete),
    isResponseComplete: Boolean(message.isResponseComplete ?? true),
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    toolName: typeof message.toolName === 'string' ? message.toolName : undefined,
    toolArguments:
      message.toolArguments && typeof message.toolArguments === 'object'
        ? message.toolArguments
        : undefined,
    toolResult: typeof message.toolResult === 'string' ? message.toolResult : undefined,
    isToolResultComplete: message.role === 'tool' ? Boolean(message.isToolResultComplete ?? true) : undefined,
    parentId: typeof message.parentId === 'string' ? message.parentId : null,
    childIds: Array.isArray(message.childIds)
      ? message.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
      : [],
    content: serializeMessageContent(message),
    artifactRefs: serializeMessageArtifactRefs(message),
  };
}

export function buildConversationStateSnapshot(appState, { getMessageArtifacts = () => [] } = {}) {
  const artifactsById = new Map();
  const resolveMessageArtifacts =
    typeof getMessageArtifacts === 'function'
      ? getMessageArtifacts
      : (_message, _conversationId) => [];
  const snapshot = {
    format: CONVERSATION_COLLECTION_FORMAT,
    schemaVersion: CONVERSATION_SCHEMA_VERSION,
    savedAt: Date.now(),
    storage: {
      artifactPolicy: {
        textEncoding: 'utf-8',
        binaryEncoding: 'base64',
        integrityHash: 'sha256',
      },
      artifactRecordShape: {
        id: 'string',
        conversationId: 'string',
        messageId: 'string|null',
        kind: 'text|binary',
        mimeType: 'string',
        encoding: 'utf-8|base64',
        data: 'string',
        hash: { algorithm: 'sha256', value: 'hex' },
        filename: 'string|null',
        workspacePath: 'string|null',
      },
    },
    artifacts: [],
    activeConversationId: appState.activeConversationId,
    conversationCount: appState.conversationCount,
    conversationIdCounter: appState.conversationIdCounter,
    conversations: appState.conversations.map((conversation) => {
      const pathMessages = getConversationPathMessages(conversation);
      conversation.messageNodes.forEach((message) => {
        resolveMessageArtifacts(message, conversation.id).forEach((artifact) => {
          if (!artifact || typeof artifact.id !== 'string' || !artifact.id.trim()) {
            return;
          }
          artifactsById.set(artifact.id.trim(), artifact);
        });
      });
      return {
        id: conversation.id,
        name: conversation.name,
        modelId:
          typeof conversation.modelId === 'string' && conversation.modelId.trim()
            ? normalizeModelId(conversation.modelId)
            : undefined,
        systemPrompt:
          typeof conversation.systemPrompt === 'string' && conversation.systemPrompt.trim()
            ? conversation.systemPrompt
            : undefined,
        conversationSystemPrompt:
          typeof conversation.conversationSystemPrompt === 'string' &&
          conversation.conversationSystemPrompt.trim()
            ? conversation.conversationSystemPrompt
            : undefined,
        appendConversationSystemPrompt:
          conversation.appendConversationSystemPrompt === false ? false : undefined,
        startedAt: normalizeTimestamp(conversation.startedAt),
        hasGeneratedName: Boolean(conversation.hasGeneratedName),
        currentWorkingDirectory: normalizeConversationWorkingDirectory(
          conversation.currentWorkingDirectory
        ),
        artifacts: [],
        activeLeafMessageId:
          typeof conversation.activeLeafMessageId === 'string' ? conversation.activeLeafMessageId : null,
        lastSpokenLeafMessageId:
          typeof conversation.lastSpokenLeafMessageId === 'string'
            ? conversation.lastSpokenLeafMessageId
            : null,
        messageNodeCounter: Number.isInteger(conversation.messageNodeCounter)
          ? conversation.messageNodeCounter
          : conversation.messageNodes.length,
        messageNodes: conversation.messageNodes.map((message) => serializeConversationMessage(message)),
        messages: pathMessages.map((message) => serializeConversationMessage(message)),
      };
    }),
  };
  snapshot.artifacts = [...artifactsById.values()];
  return snapshot;
}

export function applyStoredConversationState(rawState, appState, { untitledPrefix = 'New Conversation' } = {}) {
  if (!rawState || typeof rawState !== 'object' || !Array.isArray(rawState.conversations)) {
    return false;
  }

  const artifactLookup = buildStoredArtifactLookup(rawState);
  const restoredConversations = rawState.conversations
    .map((rawConversation, conversationIndex) => {
      if (!rawConversation || typeof rawConversation !== 'object') {
        return null;
      }

      const id =
        typeof rawConversation.id === 'string' && rawConversation.id.trim()
          ? rawConversation.id.trim()
          : `conversation-${conversationIndex + 1}`;
      const normalizedStoredName = normalizeConversationName(rawConversation.name);
      const isLegacyNumberedUntitled = isLegacyNumberedUntitledConversationName(
        normalizedStoredName,
      );
      const name = isLegacyUntitledConversationName(normalizedStoredName)
        ? untitledPrefix
        : normalizedStoredName || untitledPrefix;
      const modelId =
        typeof rawConversation.modelId === 'string' && rawConversation.modelId.trim()
          ? normalizeModelId(rawConversation.modelId)
          : '';
      const systemPrompt = normalizeSystemPrompt(rawConversation.systemPrompt);
      const conversationSystemPrompt = normalizeSystemPrompt(rawConversation.conversationSystemPrompt);
      const appendConversationSystemPrompt = normalizeConversationPromptMode(
        rawConversation.appendConversationSystemPrompt,
      );
      const rawMessageNodes = Array.isArray(rawConversation.messageNodes) ? rawConversation.messageNodes : [];
      const hasNodeSchema = rawMessageNodes.length > 0;
      const rawMessages = hasNodeSchema
        ? rawMessageNodes
        : Array.isArray(rawConversation.messages)
          ? rawConversation.messages
          : [];
      const messageNodes = rawMessages
        .map((rawMessage, messageIndex) =>
          hasNodeSchema
            ? coerceStoredMessageNode(rawMessage, `${id}-node-${messageIndex + 1}`, artifactLookup)
            : coerceStoredMessage(rawMessage, `${id}-node-${messageIndex + 1}`, artifactLookup),
        )
        .filter(Boolean);

      if (!hasNodeSchema) {
        let previousId = null;
        messageNodes.forEach((message) => {
          message.parentId = previousId;
          message.childIds = [];
          if (previousId) {
            const previousMessage = messageNodes.find((candidate) => candidate.id === previousId);
            if (previousMessage) {
              previousMessage.childIds = [...(previousMessage.childIds || []), message.id];
            }
          }
          previousId = message.id;
        });
      } else {
        const byId = new Map(messageNodes.map((message) => [message.id, message]));
        messageNodes.forEach((message) => {
          message.childIds = [];
        });
        messageNodes.forEach((message) => {
          if (!message.parentId) {
            return;
          }
          const parentMessage = byId.get(message.parentId);
          if (!parentMessage) {
            message.parentId = null;
            return;
          }
          parentMessage.childIds.push(message.id);
        });
      }

      const messageNodeCounterFromIds = messageNodes.reduce(
        (maxCounter, message) => Math.max(maxCounter, parseMessageNodeCounterFromId(message.id)),
        0,
      );
      const storedNodeCounter = Number.parseInt(String(rawConversation.messageNodeCounter || ''), 10);
      const messageNodeCounter =
        Number.isInteger(storedNodeCounter) && storedNodeCounter > 0
          ? Math.max(storedNodeCounter, messageNodeCounterFromIds)
          : Math.max(messageNodeCounterFromIds, messageNodes.length);
      const requestedActiveLeaf =
        typeof rawConversation.activeLeafMessageId === 'string'
          ? rawConversation.activeLeafMessageId
          : messageNodes[messageNodes.length - 1]?.id || null;
      const activeLeafMessageId = messageNodes.some((message) => message.id === requestedActiveLeaf)
        ? requestedActiveLeaf
        : messageNodes[messageNodes.length - 1]?.id || null;
      const requestedLastSpokenLeaf =
        typeof rawConversation.lastSpokenLeafMessageId === 'string'
          ? rawConversation.lastSpokenLeafMessageId
          : activeLeafMessageId;
      const lastSpokenLeafMessageId = messageNodes.some(
        (message) => message.id === requestedLastSpokenLeaf,
      )
        ? requestedLastSpokenLeaf
        : activeLeafMessageId;
      const earliestMessageTimestamp = messageNodes.reduce((earliest, message) => {
        const candidate = normalizeTimestamp(message.createdAt);
        if (!candidate) {
          return earliest;
        }
        return earliest ? Math.min(earliest, candidate) : candidate;
      }, null);
      const startedAt =
        normalizeTimestamp(rawConversation.startedAt ?? rawConversation.createdAt) ||
        earliestMessageTimestamp ||
        Date.now();
      const currentWorkingDirectory = normalizeConversationWorkingDirectory(
        rawConversation.currentWorkingDirectory
      );

      if (
        messageNodes.length === 0 &&
        rawConversation.hasGeneratedName !== true &&
        isLegacyNumberedUntitled
      ) {
        return null;
      }

      return {
        id,
        name,
        modelId,
        systemPrompt,
        conversationSystemPrompt,
        appendConversationSystemPrompt,
        startedAt,
        messageNodes,
        messageNodeCounter,
        activeLeafMessageId,
        lastSpokenLeafMessageId,
        hasGeneratedName: Boolean(rawConversation.hasGeneratedName),
        currentWorkingDirectory,
      };
    })
    .filter(Boolean);

  if (!restoredConversations.length) {
    return false;
  }

  appState.conversations.length = 0;
  appState.conversations.push(...restoredConversations);
  appState.activeConversationId = null;

  const maxCounterFromIds = appState.conversations.reduce(
    (maxCounter, conversation) => Math.max(maxCounter, parseConversationCounterFromId(conversation.id)),
    0,
  );
  const storedIdCounter = Number.parseInt(String(rawState.conversationIdCounter || ''), 10);
  const storedConversationCount = Number.parseInt(String(rawState.conversationCount || ''), 10);
  appState.conversationIdCounter =
    Number.isInteger(storedIdCounter) && storedIdCounter > 0
      ? Math.max(storedIdCounter, maxCounterFromIds)
      : maxCounterFromIds;
  appState.conversationCount =
    Number.isInteger(storedConversationCount) && storedConversationCount > 0
      ? storedConversationCount
      : appState.conversations.length;

  return true;
}
