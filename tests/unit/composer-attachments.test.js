import { beforeEach, describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  FILE_ATTACHMENT_ACCEPT,
  IMAGE_AND_FILE_ATTACHMENT_ACCEPT,
  MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_PDF_ATTACHMENT_TEXT_CHARS,
  MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES,
  buildPdfAttachmentConversion,
  buildTextAttachmentConversion,
  createComposerAttachmentFromFile,
  formatAttachmentSize,
  getAttachmentButtonAcceptValue,
  getAttachmentIconClass,
  getSupportedAttachmentMetadata,
  truncateAttachmentText,
} from '../../src/attachments/composer-attachments.js';

describe('composer-attachments', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.DOMParser = dom.window.DOMParser;
    dom.window.TextDecoder = globalThis.TextDecoder;
  });

  test('returns the expected attachment accept filters', () => {
    expect(FILE_ATTACHMENT_ACCEPT).toBe('.txt,.csv,.md,.html,.htm,.css,.js,.pdf');
    expect(IMAGE_AND_FILE_ATTACHMENT_ACCEPT).toBe(`image/*,${FILE_ATTACHMENT_ACCEPT}`);
    expect(getAttachmentButtonAcceptValue(false)).toBe(FILE_ATTACHMENT_ACCEPT);
    expect(getAttachmentButtonAcceptValue(true)).toBe(IMAGE_AND_FILE_ATTACHMENT_ACCEPT);
  });

  test('derives attachment metadata and icon classes by file type', () => {
    expect(getSupportedAttachmentMetadata({ name: 'notes.md', type: '' })).toEqual({
      category: 'file',
      mimeType: 'text/markdown',
      extension: 'md',
      label: 'Markdown file',
    });
    expect(getSupportedAttachmentMetadata({ name: 'lesson.pdf', type: 'application/pdf' })).toEqual(
      {
        category: 'pdf',
        mimeType: 'application/pdf',
        extension: 'pdf',
        label: 'PDF document',
      }
    );
    expect(getSupportedAttachmentMetadata({ name: 'diagram.png', type: 'image/png' })).toEqual({
      category: 'image',
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(
      getSupportedAttachmentMetadata({ name: 'archive.zip', type: 'application/zip' })
    ).toBeNull();

    expect(getAttachmentIconClass({ type: 'image' })).toBe('bi-image');
    expect(getAttachmentIconClass({ extension: 'csv' })).toBe('bi-file-earmark-spreadsheet');
    expect(getAttachmentIconClass({ extension: 'pdf' })).toBe('bi-file-earmark-pdf');
    expect(getAttachmentIconClass({ mimeType: 'text/markdown' })).toBe('bi-file-earmark-richtext');
    expect(getAttachmentIconClass({ extension: 'txt' })).toBe('bi-file-earmark-text');
  });

  test('formats text attachment conversions and converts html to markdown', () => {
    const result = buildTextAttachmentConversion({
      filename: 'lesson.html',
      mimeType: 'text/html',
      extension: 'html',
      text: '<h1>Lesson</h1><p>Line one.</p>',
    });

    expect(result.normalizedFormat).toBe('markdown');
    expect(result.normalizedText).toContain('# Lesson');
    expect(result.llmText).toContain('Converted from HTML to Markdown before prompt insertion.');
    expect(result.llmText).toContain('Contents:\n# Lesson');
    expect(result.memoryHint).toEqual({
      ingestible: true,
      preferredSource: 'normalizedText',
      documentRole: 'attachment',
    });
  });

  test('adds a truncation warning for oversized text attachment conversions', () => {
    const result = buildTextAttachmentConversion({
      filename: 'lesson.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      text: 'A'.repeat(450000),
    });

    expect(result.normalizedText).toContain('[Truncated due to attachment length limit.]');
    expect(result.conversionWarnings).toContain(
      'Extracted text was truncated to 400,000 characters for local storage and prompt preparation.'
    );
  });

  test('truncates oversized attachment text with a stable marker', () => {
    const oversizedText = 'A'.repeat(MAX_PDF_ATTACHMENT_TEXT_CHARS + 25);
    const result = truncateAttachmentText(oversizedText, MAX_PDF_ATTACHMENT_TEXT_CHARS);

    expect(result.wasTruncated).toBe(true);
    expect(result.text).toContain('[Truncated due to attachment length limit.]');
    expect(result.omittedChars).toBeGreaterThan(0);
  });

  test('builds pdf conversions with warnings and page metadata', () => {
    const result = buildPdfAttachmentConversion({
      filename: 'lesson.pdf',
      mimeType: 'application/pdf',
      pages: [
        { pageNumber: 1, text: 'Intro' },
        { pageNumber: 2, text: 'Details' },
      ],
      warnings: ['Scanned figures were skipped.'],
    });

    expect(result.pageCount).toBe(2);
    expect(result.normalizedText).toContain('Page 1\nIntro');
    expect(result.normalizedText).toContain('Page 2\nDetails');
    expect(result.conversionWarnings).toContain('Scanned figures were skipped.');
    expect(result.llmText).toContain('Attached PDF: lesson.pdf');
    expect(result.llmText).toContain('Page count: 2');
    expect(result.llmText).toContain('Extraction warnings:');
    expect(result.memoryHint).toEqual({
      ingestible: true,
      preferredSource: 'llmText',
      documentRole: 'attachment',
    });
  });

  test('formats attachment sizes for compact UI display', () => {
    expect(formatAttachmentSize(0)).toBe('');
    expect(formatAttachmentSize(850)).toBe('850 B');
    expect(formatAttachmentSize(2048)).toBe('2 KB');
    expect(formatAttachmentSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  test('rejects oversized text attachments before reading them into memory', async () => {
    await expect(
      createComposerAttachmentFromFile({
        name: 'notes.txt',
        type: 'text/plain',
        size: MAX_TEXT_ATTACHMENT_FILE_SIZE_BYTES + 1,
        arrayBuffer: () => {
          throw new Error('arrayBuffer should not be called');
        },
      })
    ).rejects.toThrow('Text attachments larger than 5 MB are not supported yet.');
  });

  test('rejects oversized image attachments before reading them into memory', async () => {
    await expect(
      createComposerAttachmentFromFile({
        name: 'photo.png',
        type: 'image/png',
        size: MAX_IMAGE_ATTACHMENT_FILE_SIZE_BYTES + 1,
        arrayBuffer: () => {
          throw new Error('arrayBuffer should not be called');
        },
      })
    ).rejects.toThrow('Image files larger than 15 MB are not supported yet.');
  });

  test('stores uploaded files in the workspace and records the linux-style path', async () => {
    const workspaceFileSystem = {
      storeUploadedFile: vi.fn(async (_file, options) => {
        expect(options?.directoryPath).toBe('/workspace');
        expect(options?.data).toBeInstanceOf(ArrayBuffer);
        return {
          path: '/workspace/notes.txt',
        };
      }),
    };

    const attachment = await createComposerAttachmentFromFile(
      {
        name: 'notes.txt',
        type: 'text/plain',
        size: 11,
        arrayBuffer: async () => new globalThis.TextEncoder().encode('hello world').buffer,
      },
      { workspaceFileSystem },
    );

    expect(workspaceFileSystem.storeUploadedFile).toHaveBeenCalledTimes(1);
    expect(attachment).toMatchObject({
      type: 'file',
      filename: 'notes.txt',
      workspacePath: '/workspace/notes.txt',
    });
  });
});
