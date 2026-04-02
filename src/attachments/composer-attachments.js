import { convertHtmlToMarkdown } from './html-to-markdown.js';
import { extractPdfText } from './pdf-extractor.js';
import { WORKSPACE_ROOT_PATH } from '../workspace/workspace-file-system.js';

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

export const FILE_ATTACHMENT_ACCEPT = '.txt,.csv,.md,.html,.htm,.css,.js,.pdf';
export const IMAGE_AND_FILE_ATTACHMENT_ACCEPT = `image/*,${FILE_ATTACHMENT_ACCEPT}`;
export const MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_ATTACHMENT_TEXT_CHARS = 400000;
export const MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_ATTACHMENT_PIXEL_COUNT = 40000000;
export const MAX_PDF_ATTACHMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_ATTACHMENT_TEXT_CHARS = 120000;

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

export function getAttachmentButtonAcceptValue(imageInputSupported) {
  return imageInputSupported ? IMAGE_AND_FILE_ATTACHMENT_ACCEPT : FILE_ATTACHMENT_ACCEPT;
}

export function getAttachmentIconClass(attachment) {
  if (attachment?.type === 'image') {
    return 'bi-image';
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

export function buildTextFileLlmText({ filename, mimeType, text, conversionNote = '' }) {
  const normalizedFilename =
    typeof filename === 'string' && filename.trim() ? filename.trim() : 'file';
  const normalizedMimeType =
    typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'text/plain';
  const body = normalizeAttachmentText(text);
  return [
    `Attached file: ${normalizedFilename}`,
    `MIME type: ${normalizedMimeType}`,
    conversionNote,
    'Contents:',
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildTextAttachmentConversion({ filename, mimeType, extension, text }) {
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
    llmText: buildTextFileLlmText({
      filename,
      mimeType,
      text: normalizedText,
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

export function buildPdfFileLlmText({ filename, mimeType, pageCount, body, conversionWarnings }) {
  const headerLines = [
    `Attached PDF: ${typeof filename === 'string' && filename.trim() ? filename.trim() : 'document.pdf'}`,
    `MIME type: ${typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'application/pdf'}`,
  ];
  if (Number.isFinite(pageCount) && pageCount > 0) {
    headerLines.push(`Page count: ${pageCount}`);
  }
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

export function buildPdfAttachmentConversion({ filename, mimeType, pages, warnings }) {
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
    llmText,
    pageCount,
  };
}

export async function createComposerAttachmentFromFile(file, options = {}) {
  const workspaceFileSystem = options?.workspaceFileSystem;
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
  if (attachmentMetadata.category === 'file' && fileSize > MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES) {
    throw new Error(
      `Text attachments larger than ${Math.round(MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES / (1024 * 1024))} MB are not supported yet.`
    );
  }
  const buffer = await file.arrayBuffer();
  const storedWorkspaceFile = workspaceFileSystem
    ? await workspaceFileSystem.storeUploadedFile(file, {
        directoryPath: WORKSPACE_ROOT_PATH,
        data: buffer,
      })
    : null;
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
      filename: file.name || 'image',
      size: Number.isFinite(file.size) ? file.size : buffer.byteLength,
      width: dimensions.width,
      height: dimensions.height,
      alt: file.name ? `Selected image: ${file.name}` : 'Selected image',
      workspacePath: storedWorkspaceFile?.path,
      hash: {
        algorithm: 'sha256',
        value: hashValue,
      },
    };
  }
  const mimeType = attachmentMetadata.mimeType || 'text/plain';
  const extension = attachmentMetadata.extension || getFileExtension(file.name || '');
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
      filename: file.name || 'file.pdf',
      mimeType,
      pages: pdfExtraction.pages,
      warnings: pdfExtraction.warnings,
    });
    text = conversion.normalizedText;
  } else {
    text = new window.TextDecoder('utf-8').decode(buffer);
    conversion = buildTextAttachmentConversion({
      filename: file.name || 'file',
      mimeType,
      extension,
      text,
    });
  }
  return {
    id,
    type: 'file',
    kind: 'text',
    mimeType,
    encoding: 'utf-8',
    data: text,
    filename: file.name || 'file',
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
