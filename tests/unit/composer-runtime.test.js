import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { createComposerRuntimeController } from '../../src/app/composer-runtime.js';

function createHarness() {
  const dom = new JSDOM(`
    <div id="composerAttachmentTray"></div>
    <input id="imageAttachmentInput" type="file" />
  `);
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;

  const appState = {
    pendingComposerAttachments: [],
    pendingAttachmentOperationCount: 0,
  };

  return {
    appState,
    document,
    controller: createComposerRuntimeController({
      appState,
      documentRef: document,
      imageAttachmentInput: document.getElementById('imageAttachmentInput'),
      composerAttachmentTray: document.getElementById('composerAttachmentTray'),
      getAttachmentIconClass: () => 'bi-file-earmark-text',
      formatAttachmentSize: (size) => (size ? `${size} B` : ''),
      setIconButtonContent: (button, iconClass, label) => {
        button.dataset.iconClass = iconClass;
        button.textContent = label;
      },
    }),
  };
}

describe('composer-runtime', () => {
  test('renders pending attachments and clears them with input reset', () => {
    const harness = createHarness();
    harness.appState.pendingComposerAttachments = [
      {
        id: 'image-1',
        type: 'image',
        filename: 'diagram.png',
        url: 'blob:diagram',
        alt: 'Diagram preview',
        size: 512,
      },
      {
        id: 'audio-1',
        type: 'audio',
        filename: 'lecture.mp3',
        url: 'blob:audio',
        mimeType: 'audio/mpeg',
        durationSeconds: 65,
        size: 2048,
      },
      {
        id: 'file-1',
        type: 'file',
        filename: 'notes.md',
        extension: 'md',
        size: 128,
      },
    ];

    harness.controller.renderComposerAttachments();

    const tray = harness.document.getElementById('composerAttachmentTray');
    expect(tray?.classList.contains('d-none')).toBe(false);
    expect(tray?.getAttribute('aria-busy')).toBe('false');
    expect(tray?.querySelectorAll('.composer-attachment-card')).toHaveLength(3);
    expect(
      Array.from(tray?.querySelectorAll('.composer-attachment-remove') || [], (button) =>
        button.getAttribute('aria-label')
      )
    ).toEqual(['Remove diagram.png', 'Remove lecture.mp3', 'Remove notes.md']);

    const input = harness.document.getElementById('imageAttachmentInput');
    if (input instanceof harness.document.defaultView.HTMLInputElement) {
      Object.defineProperty(input, 'value', {
        configurable: true,
        writable: true,
        value: 'C:\\fakepath\\diagram.png',
      });
    }

    harness.controller.clearPendingComposerAttachments();

    expect(harness.controller.getPendingComposerAttachments()).toEqual([]);
    expect(tray?.classList.contains('d-none')).toBe(true);
    expect(input?.value).toBe('');
  });

  test('filters unsupported attachments and builds a specific status message', () => {
    const harness = createHarness();
    const result = harness.controller.filterPendingComposerAttachmentsForModel(
      [
        { id: 'image-1', type: 'image', filename: 'diagram.png' },
        { id: 'image-2', type: 'image', filename: 'chart.png' },
        { id: 'audio-1', type: 'audio', filename: 'lecture.mp3' },
        { id: 'file-1', type: 'file', filename: 'notes.md' },
      ],
      {
        imageInputSupported: true,
        audioInputSupported: false,
        videoInputSupported: false,
        maxImageInputs: 1,
        maxAudioInputs: null,
        maxVideoInputs: null,
      }
    );

    expect(result.attachments.map((attachment) => attachment.id)).toEqual(['image-1', 'file-1']);
    expect(result.removedUnsupported.map((attachment) => attachment.id)).toEqual(['audio-1']);
    expect(result.removedLimited.map((attachment) => attachment.id)).toEqual(['image-2']);
    expect(
      harness.controller.buildRemovedComposerAttachmentStatus({
        ...result,
        mediaSupport: {
          imageInputSupported: true,
          audioInputSupported: false,
          videoInputSupported: false,
          maxImageInputs: 1,
          maxAudioInputs: null,
          maxVideoInputs: null,
        },
      })
    ).toBe(
      'audio attachment was removed because the selected model does not support it. Extra image attachments were removed because the selected model only accepts 1 image attachment.'
    );
  });

  test('derives artifact records from persisted attachment message parts', () => {
    const harness = createHarness();
    const payload = harness.controller.buildUserMessageAttachmentPayload([
      {
        id: 'file-1',
        kind: 'text',
        type: 'file',
        mimeType: 'text/markdown',
        filename: 'notes.md',
        extension: 'md',
        size: 128,
        data: '# Notes',
        normalizedText: '# Notes',
        normalizedFormat: 'markdown',
        workspacePath: '/workspace/notes.md',
        hash: { algorithm: 'sha256', value: 'abc123' },
      },
    ]);

    const artifacts = harness.controller.getMessageArtifacts(
      {
        id: 'message-1',
        content: {
          parts: payload.contentParts,
        },
        artifactRefs: payload.artifactRefs,
      },
      'conversation-1'
    );

    expect(artifacts).toEqual([
      {
        id: 'file-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        kind: 'text',
        mimeType: 'text/markdown',
        encoding: 'utf-8',
        data: '# Notes',
        hash: { algorithm: 'sha256', value: 'abc123' },
        filename: 'notes.md',
        workspacePath: '/workspace/notes.md',
      },
    ]);
  });
});
