import { beforeEach, describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  FILE_ATTACHMENT_ACCEPT,
  IMAGE_AND_FILE_ATTACHMENT_ACCEPT,
  MAX_PDF_ATTACHMENT_TEXT_CHARS,
  buildPdfAttachmentConversion,
  buildTextAttachmentConversion,
  formatAttachmentSize,
  getAttachmentButtonAcceptValue,
  getAttachmentIconClass,
  getSupportedAttachmentMetadata,
  truncateAttachmentText,
} from '../../src/attachments/composer-attachments.js';

describe('composer-attachments', () => {
  beforeEach(() => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
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
    expect(getSupportedAttachmentMetadata({ name: 'lesson.pdf', type: 'application/pdf' })).toEqual({
      category: 'pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      label: 'PDF document',
    });
    expect(getSupportedAttachmentMetadata({ name: 'diagram.png', type: 'image/png' })).toEqual({
      category: 'image',
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(getSupportedAttachmentMetadata({ name: 'archive.zip', type: 'application/zip' })).toBeNull();

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
});
