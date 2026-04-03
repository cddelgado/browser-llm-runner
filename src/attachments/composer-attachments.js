import { convertHtmlToMarkdown } from './html-to-markdown.js';
import { extractPdfText } from './pdf-extractor.js';
import {
  WORKSPACE_ROOT_PATH,
  sanitizeUploadedFilename,
} from '../workspace/workspace-file-system.js';

export const SUPPORTED_TEXT_ATTACHMENT_TYPES = Object.freeze({
  txt: { mimeType: 'text/plain', label: 'Text file' },
  csv: { mimeType: 'text/csv', label: 'CSV file' },
  md: { mimeType: 'text/markdown', label: 'Markdown file' },
  html: { mimeType: 'text/html', label: 'HTML file' },
  htm: { mimeType: 'text/html', label: 'HTML file' },
  css: { mimeType: 'text/css', label: 'CSS file' },
  js: { mimeType: 'text/javascript', label: 'JavaScript file' },
  pdf: { mimeType: 'application/pdf', label: 'PDF document', category: 'pdf' },
});

export const SUPPORTED_AUDIO_ATTACHMENT_TYPES = Object.freeze({
  mp3: { mimeType: 'audio/mpeg', label: 'MP3 audio' },
  wav: { mimeType: 'audio/wav', label: 'WAV audio' },
  ogg: { mimeType: 'audio/ogg', label: 'Ogg audio' },
  oga: { mimeType: 'audio/ogg', label: 'Ogg audio' },
  flac: { mimeType: 'audio/flac', label: 'FLAC audio' },
  aac: { mimeType: 'audio/aac', label: 'AAC audio' },
  m4a: { mimeType: 'audio/mp4', label: 'M4A audio' },
  webm: { mimeType: 'audio/webm', label: 'WebM audio' },
});

export const FILE_ATTACHMENT_ACCEPT = '.txt,.csv,.md,.html,.htm,.css,.js,.pdf';
export const AUDIO_ATTACHMENT_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.oga,.flac,.aac,.m4a,.webm';
export const IMAGE_AND_FILE_ATTACHMENT_ACCEPT = `image/*,${FILE_ATTACHMENT_ACCEPT}`;
export const MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_TEXT_CHARS = 400000;
export const MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENT_PIXEL_COUNT = 40000000;
export const MAX_AUDIO_ATTACHMENT_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_TEXT_CHARS = 120000;
export const AUDIO_ATTACHMENT_SAMPLE_RATE = 16000;

function base64FromArrayBuffer(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

async function computeSha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getAudioContextClass() {
  if (typeof window?.AudioContext === 'function') {
    return window.AudioContext;
  }
  const webkitAudioContext = /** @type {Window & { webkitAudioContext?: typeof AudioContext }} */ (
    window
  ).webkitAudioContext;
  if (typeof webkitAudioContext === 'function') {
    return webkitAudioContext;
  }
  return null;
}

function float32ArrayToBase64(floatArray) {
  if (!(floatArray instanceof Float32Array)) {
    return '';
  }
  const byteView = new Uint8Array(
    floatArray.buffer.slice(floatArray.byteOffset, floatArray.byteOffset + floatArray.byteLength)
  );
  return base64FromArrayBuffer(byteView.buffer);
}

async function decodeAudioForAttachment(buffer, targetSampleRate = AUDIO_ATTACHMENT_SAMPLE_RATE) {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) {
    throw new Error('This browser cannot decode uploaded audio files locally.');
  }
  const audioContext = new AudioContextClass({ sampleRate: targetSampleRate });
  try {
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    let samples;
    if (decoded.numberOfChannels === 2) {
      const left = decoded.getChannelData(0);
      const right = decoded.getChannelData(1);
      samples = new Float32Array(decoded.length);
      const scalingFactor = Math.sqrt(2);
      for (let index = 0; index < decoded.length; index += 1) {
        samples[index] = (scalingFactor * (left[index] + right[index])) / 2;
      }
    } else {
      samples = decoded.getChannelData(0).slice(0);
    }
    return {
      sampleRate: decoded.sampleRate,
      durationSeconds: decoded.duration,
      samples,
    };
  } catch {
    throw new Error('The selected audio file could not be decoded in this browser.');
  } finally {
    if (typeof audioContext.close === 'function') {
      try {
        await audioContext.close();
      } catch {
        // Ignore best-effort cleanup failures.
      }
    }
  }
}

function loadImageDimensions(src) {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: Number.isFinite(image.naturalWidth) ? image.naturalWidth : null,
        height: Number.isFinite(image.naturalHeight) ? image.naturalHeight : null,
      });
    };
    image.onerror = () => resolve({ width: null, height: null });
    image.src = src;
  });
}

export function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export function getFileExtension(filename) {
  const normalizedName = typeof filename === 'string' ? filename.trim() : '';
  if (!normalizedName.includes('.')) {
    return '';
  }
  return normalizedName.split('.').pop()?.trim().toLowerCase() || '';
}

export function getSupportedAttachmentMetadata(file) {
  const extension = getFileExtension(file?.name || '');
  const mimeType = typeof file?.type === 'string' ? file.type.trim() : '';
  if (mimeType.startsWith('image/')) {
    return {
      category: 'image',
      mimeType,
      extension,
    };
  }
  if (mimeType.startsWith('audio/')) {
    return {
      category: 'audio',
      mimeType,
      extension,
    };
  }
  const supportedAudioType = SUPPORTED_AUDIO_ATTACHMENT_TYPES[extension];
  if (supportedAudioType) {
    return {
      category: 'audio',
      mimeType: mimeType || supportedAudioType.mimeType,
      extension,
      label: supportedAudioType.label,
    };
  }
  const supportedTextType = SUPPORTED_TEXT_ATTACHMENT_TYPES[extension];
  if (supportedTextType) {
    return {
      category: supportedTextType.category || 'file',
      mimeType: mimeType || supportedTextType.mimeType,
      extension,
      label: supportedTextType.label,
    };
  }
  return null;
}

export function getAttachmentButtonAcceptValue({
  imageInputSupported = false,
  audioInputSupported = false,
} = {}) {
  const acceptTokens = [];
  if (imageInputSupported) {
    acceptTokens.push('image/*');
  }
  if (audioInputSupported) {
    acceptTokens.push(...AUDIO_ATTACHMENT_ACCEPT.split(','));
  }
  acceptTokens.push(...FILE_ATTACHMENT_ACCEPT.split(','));
  return [...new Set(acceptTokens)].join(',');
}

export function getAttachmentIconClass(attachment) {
  if (attachment?.type === 'image') {
    return 'bi-image';
  }
  if (attachment?.type === 'audio' || String(attachment?.mimeType || '').startsWith('audio/')) {
    return 'bi-file-earmark-music';
  }
  if (attachment?.extension === 'csv' || attachment?.mimeType === 'text/csv') {
    return 'bi-file-earmark-spreadsheet';
  }
  if (attachment?.extension === 'pdf' || attachment?.mimeType === 'application/pdf') {
    return 'bi-file-earmark-pdf';
  }
  if (attachment?.extension === 'md' || attachment?.mimeType === 'text/markdown') {
    return 'bi-file-earmark-richtext';
  }
  return 'bi-file-earmark-text';
}

export function normalizeAttachmentText(text) {
  return typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
}

export function getNormalizedTextAttachmentFormat({ mimeType, extension }) {
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const normalizedExtension = typeof extension === 'string' ? extension.trim().toLowerCase() : '';
  if (normalizedMimeType === 'text/markdown' || normalizedExtension === 'md') {
    return 'markdown';
  }
  if (
    normalizedMimeType === 'text/html' ||
    normalizedExtension === 'html' ||
    normalizedExtension === 'htm'
  ) {
    return 'markdown';
  }
  if (normalizedMimeType === 'text/csv' || normalizedExtension === 'csv') {
    return 'csv';
  }
  return 'text';
}

function buildAttachmentWorkspaceLines(workspacePath) {
  const normalizedWorkspacePath =
    typeof workspacePath === 'string' && workspacePath.trim() ? workspacePath.trim() : '';
  if (!normalizedWorkspacePath) {
    return [];
  }
  return [
    `Workspace path: ${normalizedWorkspacePath}`,
    'This file is available to inspect or modify with run_shell_command.',
  ];
}

function normalizeAttachmentMode(attachmentMode) {
  return attachmentMode === 'workWith' ? 'workWith' : 'reference';
}

function buildWorkspaceOnlyLlmText({ filename, mimeType, workspacePath = '', kind = 'file' }) {
  const normalizedFilename =
    typeof filename === 'string' && filename.trim()
      ? filename.trim()
      : kind === 'pdf'
        ? 'document.pdf'
        : 'file';
  const normalizedMimeType =
    typeof mimeType === 'string' && mimeType.trim()
      ? mimeType.trim()
      : kind === 'pdf'
        ? 'application/pdf'
        : 'text/plain';
  return [
    kind === 'pdf' ? `Attached PDF: ${normalizedFilename}` : `Attached file: ${normalizedFilename}`,
    `MIME type: ${normalizedMimeType}`,
    ...buildAttachmentWorkspaceLines(workspacePath),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTextFileLlmText({
  filename,
  mimeType,
  text,
  conversionNote = '',
  workspacePath = '',
}) {
  const normalizedFilename =
    typeof filename === 'string' && filename.trim() ? filename.trim() : 'file';
  const normalizedMimeType =
    typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'text/plain';
  const body = normalizeAttachmentText(text);
  return [
    `Attached file: ${normalizedFilename}`,
    `MIME type: ${normalizedMimeType}`,
    ...buildAttachmentWorkspaceLines(workspacePath),
    conversionNote,
    'Contents:',
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTextAttachmentConversion({
  filename,
  mimeType,
  extension,
  text,
  workspacePath = '',
  attachmentMode = 'reference',
}) {
  const normalizedAttachmentMode = normalizeAttachmentMode(attachmentMode);
  const normalizedFormat = getNormalizedTextAttachmentFormat({ mimeType, extension });
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const normalizedExtension = typeof extension === 'string' ? extension.trim().toLowerCase() : '';
  const isHtmlSource =
    normalizedFormat === 'markdown' &&
    (normalizedMimeType === 'text/html' ||
      normalizedExtension === 'html' ||
      normalizedExtension === 'htm');
  const htmlConversion = isHtmlSource ? convertHtmlToMarkdown(text) : null;
  const normalizedTextResult = truncateAttachmentText(
    htmlConversion ? htmlConversion.markdown : text,
    MAX_TEXT_ATTACHMENT_TEXT_CHARS
  );
  const normalizedText = normalizeAttachmentText(normalizedTextResult.text);
  const conversionWarnings = Array.isArray(htmlConversion?.warnings)
    ? [...htmlConversion.warnings]
    : [];
  if (normalizedTextResult.wasTruncated) {
    conversionWarnings.push(
      `Extracted text was truncated to ${MAX_TEXT_ATTACHMENT_TEXT_CHARS.toLocaleString()} characters for local storage and prompt preparation.`
    );
  }
  return {
    normalizedText,
    normalizedFormat,
    conversionWarnings,
    memoryHint: {
      ingestible: true,
      preferredSource: 'normalizedText',
      documentRole: 'attachment',
    },
    llmText:
      normalizedAttachmentMode === 'workWith'
        ? buildWorkspaceOnlyLlmText({
            filename,
            mimeType,
            workspacePath,
          })
        : buildTextFileLlmText({
            filename,
            mimeType,
            text: normalizedText,
            workspacePath,
            conversionNote: isHtmlSource
              ? 'Converted from HTML to Markdown before prompt insertion.'
              : '',
          }),
  };
}

export function truncateAttachmentText(text, maxChars) {
  const normalizedText = normalizeAttachmentText(text);
  if (
    !normalizedText ||
    !Number.isFinite(maxChars) ||
    maxChars <= 0 ||
    normalizedText.length <= maxChars
  ) {
    return {
      text: normalizedText,
      wasTruncated: false,
      omittedChars: 0,
    };
  }
  const truncatedText = normalizedText.slice(0, Math.max(0, maxChars - 32)).trimEnd();
  return {
    text: `${truncatedText}\n\n[Truncated due to attachment length limit.]`,
    wasTruncated: true,
    omittedChars: normalizedText.length - truncatedText.length,
  };
}

export function buildPdfPageText(pages) {
  return pages
    .map((page) => {
      const pageNumber = Number.isFinite(page?.pageNumber) ? page.pageNumber : null;
      const pageText = normalizeAttachmentText(page?.text || '');
      if (!pageNumber) {
        return pageText;
      }
      return [`Page ${pageNumber}`, pageText].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

export function buildPdfFileLlmText({
  filename,
  mimeType,
  pageCount,
  body,
  conversionWarnings,
  workspacePath = '',
}) {
  const headerLines = [
    `Attached PDF: ${typeof filename === 'string' && filename.trim() ? filename.trim() : 'document.pdf'}`,
    `MIME type: ${typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'application/pdf'}`,
  ];
  if (Number.isFinite(pageCount) && pageCount > 0) {
    headerLines.push(`Page count: ${pageCount}`);
  }
  headerLines.push(...buildAttachmentWorkspaceLines(workspacePath));
  headerLines.push('Extraction mode: parser-derived text only. OCR is not available.');

  const sections = [headerLines.join('\n')];
  if (Array.isArray(conversionWarnings) && conversionWarnings.length) {
    sections.push(
      ['Extraction warnings:', ...conversionWarnings.map((warning) => `- ${warning}`)].join('\n')
    );
  }
  sections.push('Extracted contents:');
  sections.push(body);
  return sections.join('\n\n').trim();
}

export function buildPdfAttachmentConversion({
  filename,
  mimeType,
  pages,
  warnings,
  workspacePath = '',
  attachmentMode = 'reference',
}) {
  const normalizedAttachmentMode = normalizeAttachmentMode(attachmentMode);
  const normalizedWarnings = Array.isArray(warnings)
    ? warnings
        .filter((warning) => typeof warning === 'string')
        .map((warning) => warning.trim())
        .filter(Boolean)
    : [];
  const pageCount = Array.isArray(pages) ? pages.length : 0;
  const normalizedTextResult = truncateAttachmentText(
    buildPdfPageText(Array.isArray(pages) ? pages : []),
    MAX_PDF_ATTACHMENT_TEXT_CHARS
  );
  if (normalizedTextResult.wasTruncated) {
    normalizedWarnings.push(
      `Extracted PDF text was truncated to ${MAX_PDF_ATTACHMENT_TEXT_CHARS.toLocaleString()} characters for local storage and prompt preparation.`
    );
  }
  const normalizedText = normalizedTextResult.text;
  const llmText = buildPdfFileLlmText({
    filename,
    mimeType,
    pageCount,
    body: normalizedText,
    conversionWarnings: normalizedWarnings,
    workspacePath,
  });
  return {
    normalizedText,
    normalizedFormat: 'text',
    conversionWarnings: normalizedWarnings,
    memoryHint: {
      ingestible: true,
      preferredSource: 'llmText',
      documentRole: 'attachment',
    },
    llmText:
      normalizedAttachmentMode === 'workWith'
        ? buildWorkspaceOnlyLlmText({
            filename,
            mimeType,
            workspacePath,
            kind: 'pdf',
          })
        : llmText,
    pageCount,
  };
}

export async function createComposerAttachmentFromFile(file, options = {}) {
  const workspaceFileSystem = options?.workspaceFileSystem;
  const attachmentMode = normalizeAttachmentMode(options?.attachmentMode);
  const attachmentMetadata = getSupportedAttachmentMetadata(file);
  if (!attachmentMetadata) {
    throw new Error('Unsupported attachment type.');
  }
  const fileSize = Number.isFinite(file?.size) ? file.size : 0;
  if (attachmentMetadata.category === 'image' && fileSize > MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES) {
    throw new Error(
      `Image files larger than ${Math.round(MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES / (1024 * 1024))} MB are not supported yet.`
    );
  }
  if (attachmentMetadata.category === 'audio' && fileSize > MAX_AUDIO_ATTACHMENT_FILE_SIZE_BYTES) {
    throw new Error(
      `Audio files larger than ${Math.round(MAX_AUDIO_ATTACHMENT_FILE_SIZE_BYTES / (1024 * 1024))} MB are not supported yet.`
    );
  }
  if (attachmentMetadata.category === 'file' && fileSize > MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES) {
    throw new Error(
      `Text attachments larger than ${Math.round(MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES / (1024 * 1024))} MB are not supported yet.`
    );
  }
  const buffer = await file.arrayBuffer();
  const canonicalFilename = sanitizeUploadedFilename(file?.name || 'upload');
  const storedWorkspaceFile = workspaceFileSystem
    ? await workspaceFileSystem.storeUploadedFile(file, {
        directoryPath: WORKSPACE_ROOT_PATH,
        data: buffer,
      })
    : null;
  const visibleFilename =
    typeof storedWorkspaceFile?.filename === 'string' && storedWorkspaceFile.filename.trim()
      ? storedWorkspaceFile.filename.trim()
      : canonicalFilename;
  const hashValue = await computeSha256Hex(buffer);
  const id = crypto.randomUUID();
  if (attachmentMetadata.category === 'image') {
    const base64 = base64FromArrayBuffer(buffer);
    const mimeType = attachmentMetadata.mimeType || 'application/octet-stream';
    const url = `data:${mimeType};base64,${base64}`;
    const dimensions = await loadImageDimensions(url);
    const pixelCount =
      Number.isFinite(dimensions.width) && Number.isFinite(dimensions.height)
        ? dimensions.width * dimensions.height
        : 0;
    if (pixelCount > MAX_IMAGE_ATTACHMENT_PIXEL_COUNT) {
      throw new Error(
        `Images larger than ${MAX_IMAGE_ATTACHMENT_PIXEL_COUNT.toLocaleString()} pixels are not supported yet.`
      );
    }
    return {
      id,
      type: 'image',
      kind: 'binary',
      mimeType,
      encoding: 'base64',
      data: base64,
      url,
      filename: visibleFilename,
      size: Number.isFinite(file.size) ? file.size : buffer.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      alt: visibleFilename ? `Selected image: ${visibleFilename}` : 'Selected image',
      workspacePath: storedWorkspaceFile?.path,
      hash: {
        algorithm: 'sha256',
        value: hashValue,
      },
    };
  }
  if (attachmentMetadata.category === 'audio') {
    const base64 = base64FromArrayBuffer(buffer);
    const mimeType = attachmentMetadata.mimeType || 'application/octet-stream';
    const url = `data:${mimeType};base64,${base64}`;
    const decodedAudio = await decodeAudioForAttachment(buffer);
    return {
      id,
      type: 'audio',
      kind: 'binary',
      mimeType,
      encoding: 'base64',
      data: base64,
      url,
      filename: visibleFilename,
      size: Number.isFinite(file.size) ? file.size : buffer.byteLength,
      durationSeconds: decodedAudio.durationSeconds,
      sampleRate: decodedAudio.sampleRate,
      sampleCount: decodedAudio.samples.length,
      samplesBase64: float32ArrayToBase64(decodedAudio.samples),
      workspacePath: storedWorkspaceFile?.path,
      hash: {
        algorithm: 'sha256',
        value: hashValue,
      },
    };
  }
  const mimeType = attachmentMetadata.mimeType || 'text/plain';
  const extension = attachmentMetadata.extension || getFileExtension(visibleFilename);
  let text = '';
  let conversion;
  if (attachmentMetadata.category === 'pdf') {
    const fileSize = Number.isFinite(file.size) ? file.size : buffer.byteLength;
    if (fileSize > MAX_PDF_ATTACHMENT_FILE_SIZE_BYTES) {
      throw new Error(
        `PDF files larger than ${Math.round(MAX_PDF_ATTACHMENT_FILE_SIZE_BYTES / (1024 * 1024))} MB are not supported yet.`
      );
    }
    const pdfExtraction = await extractPdfText(buffer.slice(0));
    conversion = buildPdfAttachmentConversion({
      filename: visibleFilename || 'file.pdf',
      mimeType,
      pages: pdfExtraction.pages,
      warnings: pdfExtraction.warnings,
      workspacePath: storedWorkspaceFile?.path,
      attachmentMode,
    });
    text = conversion.normalizedText;
  } else {
    text = new window.TextDecoder('utf-8').decode(buffer);
    conversion = buildTextAttachmentConversion({
      filename: visibleFilename || 'file',
      mimeType,
      extension,
      text,
      workspacePath: storedWorkspaceFile?.path,
      attachmentMode,
    });
  }
  return {
    id,
    type: 'file',
    kind: 'text',
    mimeType,
    encoding: 'utf-8',
    data: text,
    filename: visibleFilename || 'file',
    size: Number.isFinite(file.size) ? file.size : buffer.byteLength,
    extension,
    normalizedText: conversion.normalizedText,
    normalizedFormat: conversion.normalizedFormat,
    conversionWarnings: conversion.conversionWarnings,
    memoryHint: conversion.memoryHint,
    llmText: conversion.llmText,
    pageCount: conversion.pageCount,
    workspacePath: storedWorkspaceFile?.path,
    hash: {
      algorithm: 'sha256',
      value: hashValue,
    },
  };
}
