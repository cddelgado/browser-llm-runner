const CONVERSATION_DB_NAME = 'browser-llm-runner-db';
const CONVERSATION_DB_VERSION = 2;
const LEGACY_STORE_NAME = 'appState';
const ROOT_STORE_NAME = 'conversationRoots';
const CONVERSATION_STORE_NAME = 'conversations';
const MESSAGE_STORE_NAME = 'messages';
const ARTIFACT_STORE_NAME = 'artifacts';
const LEGACY_CONVERSATION_STATE_KEY = 'conversations.v1';
const NORMALIZED_CONVERSATION_STATE_KEY = 'conversations.v2';
const CONVERSATION_SCHEMA_VERSION = 2;
const GZIP_MIN_LENGTH = 1024;

function openConversationDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(CONVERSATION_DB_NAME, CONVERSATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'key' });
      }
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

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB.'));
    };
  });
}

function requestToPromise(request, errorMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error || new Error(errorMessage));
    };
  });
}

function withTransaction(db, storeNames, mode, operation) {
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));

    Promise.resolve()
      .then(() => operation(stores, transaction))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    };
  });
}

function getTextEncoder() {
  return typeof globalThis.TextEncoder === 'function' ? new globalThis.TextEncoder() : null;
}

function hasStreamCompressionSupport() {
  return (
    typeof globalThis.CompressionStream === 'function' &&
    typeof globalThis.DecompressionStream === 'function' &&
    typeof globalThis.Response === 'function' &&
    typeof globalThis.Blob === 'function'
  );
}

async function readStreamToUint8Array(stream) {
  const response = new globalThis.Response(stream);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function gzipText(text) {
  if (!hasStreamCompressionSupport()) {
    return null;
  }
  const compressed = await readStreamToUint8Array(
    new globalThis.Blob([text], { type: 'text/plain' })
      .stream()
      .pipeThrough(new globalThis.CompressionStream('gzip')),
  );
  return compressed;
}

async function gunzipText(data) {
  if (!hasStreamCompressionSupport()) {
    return '';
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const stream = new globalThis.Blob([bytes])
    .stream()
    .pipeThrough(new globalThis.DecompressionStream('gzip'));
  return new globalThis.Response(stream).text();
}

async function encodeTextValue(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text) {
    return '';
  }
  const encoder = getTextEncoder();
  if (!encoder || text.length < GZIP_MIN_LENGTH) {
    return text;
  }
  const compressed = await gzipText(text);
  if (!compressed) {
    return text;
  }
  const original = encoder.encode(text);
  if (compressed.byteLength >= original.byteLength) {
    return text;
  }
  return {
    compression: 'gzip',
    data: compressed,
  };
}

async function decodeTextValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    value.compression === 'gzip' &&
    value.data
  ) {
    return gunzipText(value.data);
  }
  return '';
}

function base64ToBytes(base64) {
  const normalized = typeof base64 === 'string' ? base64.trim() : '';
  if (!normalized) {
    return new Uint8Array(0);
  }
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  if (typeof globalThis.Buffer === 'function') {
    return new Uint8Array(globalThis.Buffer.from(normalized, 'base64'));
  }
  return new Uint8Array(0);
}

function bytesToBase64(bytes) {
  const normalizedBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (!normalizedBytes.byteLength) {
    return '';
  }
  if (typeof globalThis.btoa === 'function') {
    let binary = '';
    const chunkSize = 32768;
    for (let offset = 0; offset < normalizedBytes.length; offset += chunkSize) {
      const chunk = normalizedBytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return globalThis.btoa(binary);
  }
  if (typeof globalThis.Buffer === 'function') {
    return globalThis.Buffer.from(normalizedBytes).toString('base64');
  }
  return '';
}

async function blobToUint8Array(blob) {
  if (blob instanceof Uint8Array) {
    return blob;
  }
  if (blob instanceof ArrayBuffer) {
    return new Uint8Array(blob);
  }
  if (typeof globalThis.Blob === 'function' && blob instanceof globalThis.Blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(0);
}

async function encodeArtifactRecord(artifact) {
  if (!artifact || typeof artifact !== 'object' || typeof artifact.id !== 'string') {
    return null;
  }
  const baseRecord = {
    id: artifact.id,
    conversationId:
      typeof artifact.conversationId === 'string' ? artifact.conversationId : null,
    messageId: typeof artifact.messageId === 'string' ? artifact.messageId : null,
    kind: artifact.kind === 'binary' ? 'binary' : 'text',
    mimeType: typeof artifact.mimeType === 'string' ? artifact.mimeType : '',
    filename: typeof artifact.filename === 'string' ? artifact.filename : null,
    workspacePath: typeof artifact.workspacePath === 'string' ? artifact.workspacePath : null,
    hash:
      artifact.hash && typeof artifact.hash === 'object'
        ? {
            algorithm: artifact.hash.algorithm,
            value: artifact.hash.value,
          }
        : undefined,
  };

  if (baseRecord.kind === 'binary') {
    const bytes =
      artifact.encoding === 'base64'
        ? base64ToBytes(artifact.data)
        : artifact.data instanceof Uint8Array
          ? artifact.data
          : new Uint8Array(0);
    return {
      ...baseRecord,
      data:
        typeof globalThis.Blob === 'function'
          ? new globalThis.Blob([bytes], { type: baseRecord.mimeType })
          : bytes,
      byteLength: bytes.byteLength,
    };
  }

  return {
    ...baseRecord,
    encoding: 'utf-8',
    data: await encodeTextValue(typeof artifact.data === 'string' ? artifact.data : ''),
  };
}

async function decodeArtifactRecord(record) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string') {
    return null;
  }
  if (record.kind === 'binary') {
    const bytes = await blobToUint8Array(record.data);
    return {
      id: record.id,
      conversationId: record.conversationId || undefined,
      messageId: record.messageId || undefined,
      kind: 'binary',
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : '',
      encoding: 'base64',
      data: bytesToBase64(bytes),
      hash:
        record.hash && typeof record.hash === 'object'
          ? {
              algorithm: record.hash.algorithm,
              value: record.hash.value,
            }
          : undefined,
      filename: typeof record.filename === 'string' ? record.filename : undefined,
      workspacePath:
        typeof record.workspacePath === 'string' ? record.workspacePath : undefined,
    };
  }

  return {
    id: record.id,
    conversationId: record.conversationId || undefined,
    messageId: record.messageId || undefined,
    kind: 'text',
    mimeType: typeof record.mimeType === 'string' ? record.mimeType : '',
    encoding: 'utf-8',
    data: await decodeTextValue(record.data),
    hash:
      record.hash && typeof record.hash === 'object'
        ? {
            algorithm: record.hash.algorithm,
            value: record.hash.value,
          }
        : undefined,
    filename: typeof record.filename === 'string' ? record.filename : undefined,
    workspacePath:
      typeof record.workspacePath === 'string' ? record.workspacePath : undefined,
  };
}

async function encodeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return Promise.all(
    toolCalls.map(async (toolCall) => ({
      name: typeof toolCall?.name === 'string' ? toolCall.name : '',
      arguments:
        toolCall?.arguments &&
        typeof toolCall.arguments === 'object' &&
        !Array.isArray(toolCall.arguments)
          ? toolCall.arguments
          : {},
      rawText: await encodeTextValue(typeof toolCall?.rawText === 'string' ? toolCall.rawText : ''),
      format: typeof toolCall?.format === 'string' ? toolCall.format : undefined,
    })),
  );
}

async function decodeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return Promise.all(
    toolCalls.map(async (toolCall) => ({
      name: typeof toolCall?.name === 'string' ? toolCall.name : '',
      arguments:
        toolCall?.arguments &&
        typeof toolCall.arguments === 'object' &&
        !Array.isArray(toolCall.arguments)
          ? toolCall.arguments
          : {},
      rawText: await decodeTextValue(toolCall?.rawText),
      format: typeof toolCall?.format === 'string' ? toolCall.format : undefined,
    })),
  );
}

async function encodeContentPart(part) {
  if (!part || typeof part !== 'object') {
    return null;
  }
  if (part.type === 'text') {
    return {
      type: 'text',
      text: await encodeTextValue(typeof part.text === 'string' ? part.text : ''),
    };
  }
  if (part.type === 'image') {
    return {
      type: 'image',
      artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
      mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      workspacePath:
        typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
      width: Number.isFinite(part.width) ? part.width : undefined,
      height: Number.isFinite(part.height) ? part.height : undefined,
      alt: typeof part.alt === 'string' ? part.alt : undefined,
      base64:
        typeof part.base64 === 'string' && !part.artifactId
          ? await encodeTextValue(part.base64)
          : undefined,
      url:
        typeof part.url === 'string' && !part.artifactId
          ? await encodeTextValue(part.url)
          : undefined,
      image:
        typeof part.image === 'string' && !part.artifactId
          ? await encodeTextValue(part.image)
          : undefined,
    };
  }
  if (part.type === 'file') {
    return {
      type: 'file',
      artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
      mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      workspacePath:
        typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
      extension: typeof part.extension === 'string' ? part.extension : undefined,
      size: Number.isFinite(part.size) ? part.size : undefined,
      pageCount: Number.isFinite(part.pageCount) ? part.pageCount : undefined,
      text:
        typeof part.text === 'string' && !part.artifactId
          ? await encodeTextValue(part.text)
          : undefined,
      normalizedText: await encodeTextValue(
        typeof part.normalizedText === 'string' ? part.normalizedText : '',
      ),
      normalizedFormat:
        typeof part.normalizedFormat === 'string' ? part.normalizedFormat : undefined,
      conversionWarnings: Array.isArray(part.conversionWarnings)
        ? part.conversionWarnings.filter(
            (warning) => typeof warning === 'string' && warning.trim(),
          )
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
      llmText: await encodeTextValue(typeof part.llmText === 'string' ? part.llmText : ''),
    };
  }
  return null;
}

async function decodeContentPart(part) {
  if (!part || typeof part !== 'object') {
    return null;
  }
  if (part.type === 'text') {
    return {
      type: 'text',
      text: await decodeTextValue(part.text),
    };
  }
  if (part.type === 'image') {
    const decoded = {
      type: 'image',
      artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
      mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      workspacePath:
        typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
      width: Number.isFinite(part.width) ? part.width : undefined,
      height: Number.isFinite(part.height) ? part.height : undefined,
      alt: typeof part.alt === 'string' ? part.alt : undefined,
    };
    const base64 = await decodeTextValue(part.base64);
    const url = await decodeTextValue(part.url);
    const image = await decodeTextValue(part.image);
    if (base64) {
      decoded.base64 = base64;
    }
    if (url) {
      decoded.url = url;
    }
    if (image) {
      decoded.image = image;
    }
    return decoded;
  }
  if (part.type === 'file') {
    const decoded = {
      type: 'file',
      artifactId: typeof part.artifactId === 'string' ? part.artifactId : undefined,
      mimeType: typeof part.mimeType === 'string' ? part.mimeType : undefined,
      filename: typeof part.filename === 'string' ? part.filename : undefined,
      workspacePath:
        typeof part.workspacePath === 'string' ? part.workspacePath : undefined,
      extension: typeof part.extension === 'string' ? part.extension : undefined,
      size: Number.isFinite(part.size) ? part.size : undefined,
      pageCount: Number.isFinite(part.pageCount) ? part.pageCount : undefined,
      normalizedText: await decodeTextValue(part.normalizedText),
      normalizedFormat:
        typeof part.normalizedFormat === 'string' ? part.normalizedFormat : undefined,
      conversionWarnings: Array.isArray(part.conversionWarnings)
        ? part.conversionWarnings.filter(
            (warning) => typeof warning === 'string' && warning.trim(),
          )
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
      llmText: await decodeTextValue(part.llmText),
    };
    const text = await decodeTextValue(part.text);
    if (text) {
      decoded.text = text;
    }
    return decoded;
  }
  return null;
}

async function encodeLlmRepresentation(value) {
  if (Array.isArray(value)) {
    const parts = await Promise.all(value.map((part) => encodeContentPart(part)));
    return parts.filter(Boolean);
  }
  if (value && typeof value === 'object' && value.type === 'text') {
    return {
      type: 'text',
      text: await encodeTextValue(typeof value.text === 'string' ? value.text : ''),
    };
  }
  if (typeof value === 'string') {
    return encodeTextValue(value);
  }
  return null;
}

async function decodeLlmRepresentation(value) {
  if (Array.isArray(value)) {
    const parts = await Promise.all(value.map((part) => decodeContentPart(part)));
    return parts.filter(Boolean);
  }
  if (value && typeof value === 'object' && value.type === 'text') {
    return {
      type: 'text',
      text: await decodeTextValue(value.text),
    };
  }
  if (typeof value === 'string' || (value && typeof value === 'object' && value.compression)) {
    return decodeTextValue(value);
  }
  return null;
}

async function encodeMessageRecord(message, conversationId, sortOrder) {
  const parts = Array.isArray(message?.content?.parts)
    ? (await Promise.all(message.content.parts.map((part) => encodeContentPart(part)))).filter(Boolean)
    : [];
  const llmRepresentation =
    message?.role === 'user'
      ? null
      : await encodeLlmRepresentation(message?.content?.llmRepresentation);
  return {
    id: message.id,
    conversationId,
    sortOrder,
    role: message.role,
    speaker: typeof message.speaker === 'string' ? message.speaker : undefined,
    text: await encodeTextValue(typeof message.text === 'string' ? message.text : ''),
    createdAt: Number.isFinite(message.createdAt) ? message.createdAt : null,
    parentId: typeof message.parentId === 'string' ? message.parentId : null,
    childIds: Array.isArray(message.childIds)
      ? message.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
      : [],
    thoughts: await encodeTextValue(typeof message.thoughts === 'string' ? message.thoughts : ''),
    response: await encodeTextValue(typeof message.response === 'string' ? message.response : ''),
    hasThinking: Boolean(message.hasThinking),
    isThinkingComplete: Boolean(message.isThinkingComplete),
    isResponseComplete: Boolean(message.isResponseComplete ?? true),
    toolCalls: await encodeToolCalls(message.toolCalls),
    toolName: typeof message.toolName === 'string' ? message.toolName : undefined,
    toolArguments:
      message.toolArguments &&
      typeof message.toolArguments === 'object' &&
      !Array.isArray(message.toolArguments)
        ? message.toolArguments
        : undefined,
    toolResult: await encodeTextValue(
      typeof message.toolResult === 'string' ? message.toolResult : '',
    ),
    isToolResultComplete: Boolean(message.isToolResultComplete ?? true),
    content: {
      parts,
      llmRepresentation,
    },
    artifactRefs: Array.isArray(message.artifactRefs)
      ? message.artifactRefs
          .map((ref) => {
            if (!ref || typeof ref !== 'object' || typeof ref.id !== 'string') {
              return null;
            }
            return {
              id: ref.id,
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
      : [],
  };
}

async function decodeMessageRecord(record) {
  const parts = Array.isArray(record?.content?.parts)
    ? (await Promise.all(record.content.parts.map((part) => decodeContentPart(part)))).filter(Boolean)
    : [];
  const llmRepresentation = await decodeLlmRepresentation(record?.content?.llmRepresentation);
  const decodedMessage = {
    id: record.id,
    role: record.role,
    speaker: typeof record.speaker === 'string' ? record.speaker : undefined,
    text: await decodeTextValue(record.text),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : null,
    parentId: typeof record.parentId === 'string' ? record.parentId : null,
    childIds: Array.isArray(record.childIds)
      ? record.childIds.filter((childId) => typeof childId === 'string' && childId.trim())
      : [],
    content: {
      parts,
      llmRepresentation,
    },
    artifactRefs: Array.isArray(record.artifactRefs)
      ? record.artifactRefs
          .map((ref) => {
            if (!ref || typeof ref !== 'object' || typeof ref.id !== 'string') {
              return null;
            }
            return {
              id: ref.id,
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
      : [],
  };

  if (typeof record.thoughts === 'string' || record.thoughts?.compression) {
    decodedMessage.thoughts = await decodeTextValue(record.thoughts);
  }
  if (typeof record.response === 'string' || record.response?.compression) {
    decodedMessage.response = await decodeTextValue(record.response);
  }
  if (typeof record.toolResult === 'string' || record.toolResult?.compression) {
    decodedMessage.toolResult = await decodeTextValue(record.toolResult);
  }
  if (record.hasThinking !== undefined) {
    decodedMessage.hasThinking = Boolean(record.hasThinking);
  }
  if (record.isThinkingComplete !== undefined) {
    decodedMessage.isThinkingComplete = Boolean(record.isThinkingComplete);
  }
  if (record.isResponseComplete !== undefined) {
    decodedMessage.isResponseComplete = Boolean(record.isResponseComplete);
  }
  if (record.toolCalls !== undefined) {
    decodedMessage.toolCalls = await decodeToolCalls(record.toolCalls);
  }
  if (record.toolName !== undefined) {
    decodedMessage.toolName = record.toolName;
  }
  if (record.toolArguments !== undefined) {
    decodedMessage.toolArguments = record.toolArguments;
  }
  if (record.isToolResultComplete !== undefined) {
    decodedMessage.isToolResultComplete = Boolean(record.isToolResultComplete);
  }

  return decodedMessage;
}

async function normalizeStateForStorage(state) {
  const conversations = Array.isArray(state?.conversations) ? state.conversations : [];
  const artifacts = Array.isArray(state?.artifacts) ? state.artifacts : [];
  const conversationRecords = conversations.map((conversation, sortOrder) => ({
    id: conversation.id,
    sortOrder,
    name: conversation.name,
    modelId: conversation.modelId,
    systemPrompt: conversation.systemPrompt,
    conversationSystemPrompt: conversation.conversationSystemPrompt,
    appendConversationSystemPrompt: conversation.appendConversationSystemPrompt,
    startedAt: conversation.startedAt,
    hasGeneratedName: Boolean(conversation.hasGeneratedName),
    activeLeafMessageId:
      typeof conversation.activeLeafMessageId === 'string'
        ? conversation.activeLeafMessageId
        : null,
    lastSpokenLeafMessageId:
      typeof conversation.lastSpokenLeafMessageId === 'string'
        ? conversation.lastSpokenLeafMessageId
        : null,
    messageNodeCounter: Number.isInteger(conversation.messageNodeCounter)
      ? conversation.messageNodeCounter
      : 0,
  }));

  const messageRecords = (
    await Promise.all(
      conversations.flatMap((conversation) =>
        Array.isArray(conversation?.messageNodes)
          ? conversation.messageNodes.map((message, sortOrder) =>
              encodeMessageRecord(message, conversation.id, sortOrder),
            )
          : [],
      ),
    )
  ).filter(Boolean);

  const artifactRecords = (
    await Promise.all(artifacts.map((artifact) => encodeArtifactRecord(artifact)))
  ).filter(Boolean);

  return {
    rootRecord: {
      key: NORMALIZED_CONVERSATION_STATE_KEY,
      schemaVersion: CONVERSATION_SCHEMA_VERSION,
      savedAt: Date.now(),
      format: typeof state?.format === 'string' ? state.format : undefined,
      activeConversationId:
        typeof state?.activeConversationId === 'string' ? state.activeConversationId : null,
      conversationCount: Number.isInteger(state?.conversationCount) ? state.conversationCount : 0,
      conversationIdCounter: Number.isInteger(state?.conversationIdCounter)
        ? state.conversationIdCounter
        : 0,
    },
    conversationRecords,
    messageRecords,
    artifactRecords,
  };
}

async function rebuildStateFromNormalizedRecords(rootRecord, conversationRecords, messageRecords, artifactRecords) {
  const decodedArtifacts = (
    await Promise.all(artifactRecords.map((record) => decodeArtifactRecord(record)))
  ).filter(Boolean);
  const decodedMessages = (
    await Promise.all(messageRecords.map((record) => decodeMessageRecord(record)))
  ).filter(Boolean);

  const messagesByConversationId = new Map();
  decodedMessages.forEach((message, index) => {
    const conversationId =
      typeof messageRecords[index]?.conversationId === 'string'
        ? messageRecords[index].conversationId
        : '';
    if (!conversationId) {
      return;
    }
    if (!messagesByConversationId.has(conversationId)) {
      messagesByConversationId.set(conversationId, []);
    }
    messagesByConversationId.get(conversationId).push({
      sortOrder: Number.isInteger(messageRecords[index]?.sortOrder)
        ? messageRecords[index].sortOrder
        : 0,
      message,
    });
  });

  const sortedConversations = [...conversationRecords].sort(
    (left, right) =>
      (Number.isInteger(left?.sortOrder) ? left.sortOrder : 0) -
      (Number.isInteger(right?.sortOrder) ? right.sortOrder : 0),
  );

  return {
    format: typeof rootRecord?.format === 'string' ? rootRecord.format : undefined,
    schemaVersion:
      Number.isInteger(rootRecord?.schemaVersion) ? rootRecord.schemaVersion : undefined,
    savedAt: Number.isFinite(rootRecord?.savedAt) ? rootRecord.savedAt : undefined,
    activeConversationId:
      typeof rootRecord?.activeConversationId === 'string'
        ? rootRecord.activeConversationId
        : null,
    conversationCount:
      Number.isInteger(rootRecord?.conversationCount) ? rootRecord.conversationCount : 0,
    conversationIdCounter:
      Number.isInteger(rootRecord?.conversationIdCounter) ? rootRecord.conversationIdCounter : 0,
    conversations: sortedConversations.map((conversation) => ({
      id: conversation.id,
      name: conversation.name,
      modelId: conversation.modelId,
      systemPrompt: conversation.systemPrompt,
      conversationSystemPrompt: conversation.conversationSystemPrompt,
      appendConversationSystemPrompt: conversation.appendConversationSystemPrompt,
      startedAt: conversation.startedAt,
      hasGeneratedName: Boolean(conversation.hasGeneratedName),
      activeLeafMessageId:
        typeof conversation.activeLeafMessageId === 'string'
          ? conversation.activeLeafMessageId
          : null,
      lastSpokenLeafMessageId:
        typeof conversation.lastSpokenLeafMessageId === 'string'
          ? conversation.lastSpokenLeafMessageId
          : null,
      messageNodeCounter: Number.isInteger(conversation.messageNodeCounter)
        ? conversation.messageNodeCounter
        : 0,
      messageNodes: (messagesByConversationId.get(conversation.id) || [])
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((entry) => entry.message),
    })),
    artifacts: decodedArtifacts,
  };
}

async function loadLegacyConversationState(db) {
  if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
    return null;
  }
  return withTransaction(db, LEGACY_STORE_NAME, 'readonly', async (stores) => {
    const record = await requestToPromise(
      stores[LEGACY_STORE_NAME].get(LEGACY_CONVERSATION_STATE_KEY),
      'Failed to read saved conversation state.',
    );
    return record?.state || null;
  });
}

async function writeNormalizedState(db, state) {
  const normalized = await normalizeStateForStorage(state);
  await withTransaction(
    db,
    [ROOT_STORE_NAME, CONVERSATION_STORE_NAME, MESSAGE_STORE_NAME, ARTIFACT_STORE_NAME],
    'readwrite',
    async (stores) => {
      stores[CONVERSATION_STORE_NAME].clear();
      stores[MESSAGE_STORE_NAME].clear();
      stores[ARTIFACT_STORE_NAME].clear();
      stores[ROOT_STORE_NAME].put(normalized.rootRecord);
      normalized.conversationRecords.forEach((record) => {
        stores[CONVERSATION_STORE_NAME].put(record);
      });
      normalized.messageRecords.forEach((record) => {
        stores[MESSAGE_STORE_NAME].put(record);
      });
      normalized.artifactRecords.forEach((record) => {
        stores[ARTIFACT_STORE_NAME].put(record);
      });
    },
  );
}

export async function loadConversationState() {
  const db = await openConversationDb();
  if (!db) {
    return null;
  }
  try {
    if (
      db.objectStoreNames.contains(ROOT_STORE_NAME) &&
      db.objectStoreNames.contains(CONVERSATION_STORE_NAME) &&
      db.objectStoreNames.contains(MESSAGE_STORE_NAME) &&
      db.objectStoreNames.contains(ARTIFACT_STORE_NAME)
    ) {
      const normalizedState = await withTransaction(
        db,
        [ROOT_STORE_NAME, CONVERSATION_STORE_NAME, MESSAGE_STORE_NAME, ARTIFACT_STORE_NAME],
        'readonly',
        async (stores) => {
          const rootRecord = await requestToPromise(
            stores[ROOT_STORE_NAME].get(NORMALIZED_CONVERSATION_STATE_KEY),
            'Failed to read saved conversation root state.',
          );
          if (!rootRecord) {
            return null;
          }
          const [conversationRecords, messageRecords, artifactRecords] = await Promise.all([
            requestToPromise(
              stores[CONVERSATION_STORE_NAME].getAll(),
              'Failed to read saved conversations.',
            ),
            requestToPromise(
              stores[MESSAGE_STORE_NAME].getAll(),
              'Failed to read saved message records.',
            ),
            requestToPromise(
              stores[ARTIFACT_STORE_NAME].getAll(),
              'Failed to read saved artifacts.',
            ),
          ]);
          return rebuildStateFromNormalizedRecords(
            rootRecord,
            Array.isArray(conversationRecords) ? conversationRecords : [],
            Array.isArray(messageRecords) ? messageRecords : [],
            Array.isArray(artifactRecords) ? artifactRecords : [],
          );
        },
      );
      if (normalizedState) {
        return normalizedState;
      }
    }
    const legacyState = await loadLegacyConversationState(db);
    if (legacyState) {
      await writeNormalizedState(db, legacyState);
    }
    return legacyState;
  } finally {
    db.close();
  }
}

export async function saveConversationState(state) {
  const db = await openConversationDb();
  if (!db) {
    return false;
  }
  try {
    await writeNormalizedState(db, state);
    return true;
  } finally {
    db.close();
  }
}
