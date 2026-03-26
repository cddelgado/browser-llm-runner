import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { bindTranscriptEvents } from '../../src/app/transcript-events.js';

function createHarness() {
  const dom = new JSDOM(
    `
      <div id="chatMain">
        <div id="chatTranscript">
          <button class="response-variant-prev" data-message-id="model-1"></button>
          <button class="copy-message-btn" data-message-id="model-2" data-copy-type="message"></button>
        </div>
      </div>
      <button id="jumpToTopButton" aria-disabled="false"></button>
      <button id="jumpToPreviousUserButton" aria-disabled="false"></button>
      <button id="jumpToNextModelButton" aria-disabled="false"></button>
      <button id="jumpToLatestButton" aria-disabled="false"></button>
      <div id="chatTranscriptStart" tabindex="-1"></div>
      <div id="chatTranscriptEnd" tabindex="-1"></div>
      <textarea id="messageInput"></textarea>
    `,
    { url: 'https://example.test/' },
  );
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

  return {
    dom,
    document,
    deps: {
      chatTranscript: document.getElementById('chatTranscript'),
      chatMain: document.getElementById('chatMain'),
      jumpToTopButton: document.getElementById('jumpToTopButton'),
      jumpToPreviousUserButton: document.getElementById('jumpToPreviousUserButton'),
      jumpToNextModelButton: document.getElementById('jumpToNextModelButton'),
      jumpToLatestButton: document.getElementById('jumpToLatestButton'),
      chatTranscriptStart: document.getElementById('chatTranscriptStart'),
      chatTranscriptEnd: document.getElementById('chatTranscriptEnd'),
      messageInput: document.getElementById('messageInput'),
      switchModelVariant: vi.fn(),
      regenerateFromMessage: vi.fn(),
      fixResponseFromMessage: vi.fn(async () => {}),
      switchUserVariant: vi.fn(),
      beginUserMessageEdit: vi.fn(),
      saveUserMessageEdit: vi.fn(),
      cancelUserMessageEdit: vi.fn(),
      branchFromUserMessage: vi.fn(),
      handleMessageCopyAction: vi.fn(async () => {}),
      updateTranscriptNavigationButtonVisibility: vi.fn(),
      focusTranscriptBoundary: vi.fn(),
      stepTranscriptNavigation: vi.fn(),
    },
  };
}

describe('transcript-events', () => {
  test('routes transcript action clicks to the provided handlers', async () => {
    const harness = createHarness();
    bindTranscriptEvents(harness.deps);

    harness.document.querySelector('.response-variant-prev')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );
    harness.document.querySelector('.copy-message-btn')?.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );

    await Promise.resolve();
    expect(harness.deps.switchModelVariant).toHaveBeenCalledWith('model-1', -1);
    expect(harness.deps.handleMessageCopyAction).toHaveBeenCalledWith('model-2', 'message');
  });

  test('jump to latest restores composer focus when triggered from the button', () => {
    const harness = createHarness();
    bindTranscriptEvents(harness.deps);

    harness.deps.jumpToLatestButton.focus();
    harness.deps.jumpToLatestButton.dispatchEvent(
      new harness.dom.window.MouseEvent('click', { bubbles: true }),
    );

    expect(harness.deps.focusTranscriptBoundary).toHaveBeenCalledWith(
      harness.deps.chatTranscriptEnd,
      { align: 'end' },
    );
    expect(harness.document.activeElement).toBe(harness.deps.messageInput);
  });
});
