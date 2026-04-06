import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { createModelLoadFeedbackController } from '../../src/app/model-load-feedback.js';

function createHarness() {
  const dom = new JSDOM(`
    <div id="modelLoadProgressWrap" class="d-none"></div>
    <p id="modelLoadProgressLabel"></p>
    <p id="modelLoadProgressValue"></p>
    <div id="modelLoadProgressBar"></div>
    <p id="modelLoadProgressSummary"></p>
    <p id="modelLoadCurrentFileLabel"></p>
    <p id="modelLoadCurrentFileValue"></p>
    <div id="modelLoadCurrentFileBar"></div>
    <div id="modelLoadError" class="d-none"></div>
    <p id="modelLoadErrorSummary"></p>
    <ul id="modelLoadErrorDetails"></ul>
  `);
  dom.window.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
  const document = dom.window.document;
  globalThis.document = document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;

  const appState = {
    loadProgressFiles: new Map(),
    maxObservedLoadPercent: 0,
  };

  return {
    appState,
    controller: createModelLoadFeedbackController({
      appState,
      documentRef: document,
      modelLoadFeedback: document.createElement('div'),
      modelLoadProgressWrap: document.getElementById('modelLoadProgressWrap'),
      modelLoadProgressLabel: document.getElementById('modelLoadProgressLabel'),
      modelLoadProgressValue: document.getElementById('modelLoadProgressValue'),
      modelLoadProgressBar: document.getElementById('modelLoadProgressBar'),
      modelLoadProgressSummary: document.getElementById('modelLoadProgressSummary'),
      modelLoadCurrentFileLabel: document.getElementById('modelLoadCurrentFileLabel'),
      modelLoadCurrentFileValue: document.getElementById('modelLoadCurrentFileValue'),
      modelLoadCurrentFileBar: document.getElementById('modelLoadCurrentFileBar'),
      modelLoadError: document.getElementById('modelLoadError'),
      modelLoadErrorSummary: document.getElementById('modelLoadErrorSummary'),
      modelLoadErrorDetails: document.getElementById('modelLoadErrorDetails'),
      modelCardList: document.createElement('div'),
    }),
    document,
  };
}

describe('model-load-feedback', () => {
  test('tracks progress and surfaces the latest file summary', () => {
    const harness = createHarness();

    harness.controller.showProgressRegion(true);
    harness.controller.setLoadProgress({
      percent: 25,
      message: 'Downloading model...',
      file: 'models/mock-model.onnx',
      status: 'loading',
      loadedBytes: 512,
      totalBytes: 2048,
    });

    expect(harness.document.getElementById('modelLoadProgressWrap')?.classList.contains('d-none')).toBe(
      false
    );
    expect(harness.document.getElementById('modelLoadProgressLabel')?.textContent).toBe(
      'Downloading model...'
    );
    expect(harness.document.getElementById('modelLoadProgressValue')?.textContent).toBe('0/1');
    expect(harness.document.getElementById('modelLoadProgressSummary')?.textContent).toBe(
      '0 of 1 model parts loaded'
    );
    expect(harness.document.getElementById('modelLoadCurrentFileLabel')?.textContent).toBe(
      'mock-model.onnx'
    );
    expect(harness.document.getElementById('modelLoadCurrentFileValue')?.textContent).toBe(
      '512 B / 2.0 KB'
    );
  });

  test('shows and clears structured load errors', () => {
    const harness = createHarness();

    harness.controller.showLoadError('Top level failure | Try again | Switch to WASM');

    expect(harness.document.getElementById('modelLoadError')?.classList.contains('d-none')).toBe(
      false
    );
    expect(harness.document.getElementById('modelLoadErrorSummary')?.textContent).toBe(
      'Top level failure'
    );
    expect(
      Array.from(
        harness.document.querySelectorAll('#modelLoadErrorDetails li'),
        (item) => item.textContent
      )
    ).toEqual(['Try again', 'Switch to WASM']);

    harness.controller.clearLoadError();

    expect(harness.document.getElementById('modelLoadError')?.classList.contains('d-none')).toBe(
      true
    );
    expect(harness.document.getElementById('modelLoadErrorSummary')?.textContent).toBe('');
    expect(harness.document.querySelectorAll('#modelLoadErrorDetails li')).toHaveLength(0);
  });
});
