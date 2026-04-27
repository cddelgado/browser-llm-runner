import { buildBulkConversationExportZip } from './conversation-bulk-export.js';
import {
  buildConversationDownloadMarkdown,
  buildConversationDownloadPayload,
  buildConversationJsonDownloadFileName,
  buildConversationMarkdownDownloadFileName,
} from '../state/conversation-model.js';

/**
 * @param {Blob} blob
 * @param {string} fileName
 * @param {{
 *   documentRef?: Document;
 *   urlApi?: {
 *     createObjectURL: (blob: Blob) => string;
 *     revokeObjectURL: (url: string) => void;
 *   };
 * }} [options]
 */
export function triggerDownload(
  blob,
  fileName,
  { documentRef = globalThis.document, urlApi = globalThis.URL } = {}
) {
  if (
    !documentRef?.body ||
    typeof documentRef.createElement !== 'function' ||
    typeof urlApi?.createObjectURL !== 'function' ||
    typeof urlApi?.revokeObjectURL !== 'function'
  ) {
    return false;
  }

  const safeFileName = typeof fileName === 'string' && fileName.trim() ? fileName : 'download';
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName;
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
    return true;
  } finally {
    if (anchor.isConnected) {
      anchor.remove();
    }
    urlApi.revokeObjectURL(url);
  }
}

/**
 * @param {any} activeConversation
 * @param {{
 *   getConversationModelId?: (conversation: any) => string;
 *   getActiveTemperature?: (conversation: any, modelId: string) => number | null;
 *   getConversationSystemPromptSuffix?: (modelId: string, conversation?: any) => string;
 *   getToolCallingContext?: (modelId: string) => any;
 * }} [dependencies]
 */
export function buildActiveConversationExportPayload(activeConversation, dependencies = {}) {
  const {
    getConversationModelId = (conversation) => conversation?.modelId || 'Unknown',
    getActiveTemperature = (_conversation, _modelId) => null,
    getConversationSystemPromptSuffix = (_modelId, _conversation) => '',
    getToolCallingContext = (_modelId) => null,
  } = dependencies;
  const selectedModelId = getConversationModelId(activeConversation);
  return buildConversationDownloadPayload(activeConversation, {
    modelId: selectedModelId,
    temperature: getActiveTemperature(activeConversation, selectedModelId),
    systemPromptSuffix: getConversationSystemPromptSuffix(selectedModelId, activeConversation),
    toolContext: getToolCallingContext(selectedModelId),
  });
}

/**
 * @param {{
 *   appState?: any;
 *   documentRef?: Document;
 *   urlApi?: {
 *     createObjectURL: (blob: Blob) => string;
 *     revokeObjectURL: (url: string) => void;
 *   };
 *   BlobCtor?: typeof Blob;
 *   triggerDownload?: (blob: Blob, fileName: string) => boolean | void;
 *   setStatus?: (message: string) => void;
 *   getActiveConversation?: () => any;
 *   getConversationModelId?: (conversation: any) => string;
 *   getActiveTemperature?: (conversation: any, modelId: string) => number | null;
 *   getConversationSystemPromptSuffix?: (modelId: string, conversation?: any) => string;
 *   getToolCallingContext?: (modelId: string) => any;
 *   getMessageArtifacts?: (message: any, conversationId: string) => any[];
 *   getStoredGenerationConfigForModel?: (modelId: string) => any;
 *   getModelGenerationLimits?: (modelId: string) => any;
 *   buildBulkConversationExportZipImpl?: (options: any) => {
 *     archiveFileName: string;
 *     bytes: Uint8Array;
 *   };
 * }} [options]
 */
export function createConversationDownloadController({
  appState = { conversations: [] },
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  triggerDownload: triggerDownloadImpl = (blob, fileName) =>
    triggerDownload(blob, fileName, { documentRef, urlApi }),
  setStatus = (_message) => {},
  getActiveConversation = () => null,
  getConversationModelId = (conversation) => conversation?.modelId || 'Unknown',
  getActiveTemperature = (_conversation, _modelId) => null,
  getConversationSystemPromptSuffix = (_modelId, _conversation) => '',
  getToolCallingContext = (_modelId) => null,
  getMessageArtifacts = (_message, _conversationId) => [],
  getStoredGenerationConfigForModel = (_modelId) => null,
  getModelGenerationLimits = (_modelId) => ({}),
  buildBulkConversationExportZipImpl = buildBulkConversationExportZip,
} = {}) {
  function createBlob(parts, options) {
    return new BlobCtor(parts, options);
  }

  function getActivePayload(activeConversation) {
    return buildActiveConversationExportPayload(activeConversation, {
      getConversationModelId,
      getActiveTemperature,
      getConversationSystemPromptSuffix,
      getToolCallingContext,
    });
  }

  function downloadActiveConversationBranchAsJson() {
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      setStatus('No active conversation to download.');
      return false;
    }

    const payload = getActivePayload(activeConversation);
    if (!payload.exchanges.length) {
      setStatus('No messages to download on this branch.');
      return false;
    }

    const blob = createBlob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownloadImpl(blob, buildConversationJsonDownloadFileName(activeConversation.name));
    setStatus('Conversation downloaded as JSON.');
    return true;
  }

  function downloadActiveConversationBranchAsMarkdown() {
    const activeConversation = getActiveConversation();
    if (!activeConversation) {
      setStatus('No active conversation to download.');
      return false;
    }

    const payload = getActivePayload(activeConversation);
    if (!payload.exchanges.length) {
      setStatus('No messages to download on this branch.');
      return false;
    }

    const blob = createBlob([buildConversationDownloadMarkdown(payload)], {
      type: 'text/markdown;charset=utf-8',
    });
    triggerDownloadImpl(blob, buildConversationMarkdownDownloadFileName(activeConversation.name));
    setStatus('Conversation downloaded as Markdown.');
    return true;
  }

  function exportAllConversations() {
    const conversations = Array.isArray(appState?.conversations) ? appState.conversations : [];
    if (!conversations.length) {
      setStatus('No conversations to export.');
      return false;
    }

    const { archiveFileName, bytes } = buildBulkConversationExportZipImpl({
      appState,
      getMessageArtifacts,
      getConversationModelId,
      getConversationSystemPromptSuffix,
      getToolCallingContext,
      getStoredGenerationConfigForModel,
      getModelGenerationLimits,
    });
    const blob = createBlob([Uint8Array.from(bytes)], { type: 'application/zip' });
    triggerDownloadImpl(blob, archiveFileName);
    setStatus('Conversations exported as a zip archive.');
    return true;
  }

  return {
    downloadActiveConversationBranchAsJson,
    downloadActiveConversationBranchAsMarkdown,
    exportAllConversations,
    triggerDownload: (blob, fileName) => triggerDownloadImpl(blob, fileName),
  };
}
