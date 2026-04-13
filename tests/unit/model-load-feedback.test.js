import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { createModelLoadFeedbackController } from '../../src/app/model-load-feedback.js';

function createHarness() {
  const dom = new JSDOM(`
    <div id="fallbackHost"><div id="modelLoadFeedback"></div></div>
    <div id="transcriptFeedbackHost"></div>
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
    loadProgressSequence: 0,
    maxObservedLoadPercent: 0,
  };

  return {
    appState,
    controller: createModelLoadFeedbackController({
      appState,
      documentRef: document,
      modelLoadFeedback: document.getElementById('modelLoadFeedback'),
      transcriptFeedbackHost: document.getElementById('transcriptFeedbackHost'),
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

    expect(
      harness.document.getElementById('modelLoadProgressWrap')?.classList.contains('d-none')
    ).toBe(false);
    expect(harness.document.getElementById('modelLoadProgressLabel')?.textContent).toBe(
      'Downloading model...'
    );
    expect(harness.document.getElementById('modelLoadProgressValue')?.textContent).toBe(
      '512 B / 2.0 KB'
    );
    expect(harness.document.getElementById('modelLoadProgressSummary')?.textContent).toBe(
      '512 B of 2.0 KB downloaded across 1 file'
    );
    expect(harness.document.getElementById('modelLoadProgressBar')?.style.width).toBe('25%');
    expect(harness.document.getElementById('modelLoadCurrentFileLabel')?.textContent).toBe(
      'mock-model.onnx'
    );
    expect(harness.document.getElementById('modelLoadCurrentFileValue')?.textContent).toBe(
      '512 B / 2.0 KB'
    );
    expect(harness.document.getElementById('modelLoadProgressBar')?.getAttribute('aria-valuetext')).toBe(
      'mock-model.onnx: 512 B of 2.0 KB downloaded'
    );
  });

  test('keeps aggregate bytes in the summary while the visible bar follows the latest file', () => {
    const harness = createHarness();

    harness.controller.showProgressRegion(true);
    harness.controller.setLoadProgress({
      percent: 50,
      message: 'Downloading model...',
      file: 'models/first.onnx',
      status: 'loading',
      loadedBytes: 1024,
      totalBytes: 2048,
    });
    harness.controller.setLoadProgress({
      percent: 50,
      message: 'Downloading model...',
      file: 'models/second.onnx_data',
      status: 'loading',
      loadedBytes: 512,
      totalBytes: 1024,
    });

    expect(harness.document.getElementById('modelLoadProgressValue')?.textContent).toBe(
      '512 B / 1.0 KB'
    );
    expect(harness.document.getElementById('modelLoadProgressSummary')?.textContent).toBe(
      '1.5 KB of 3.0 KB downloaded across 2 files'
    );
    expect(harness.document.getElementById('modelLoadProgressBar')?.style.width).toBe('50%');
    expect(harness.document.getElementById('modelLoadProgressBar')?.getAttribute('aria-valuetext')).toBe(
      'second.onnx_data: 512 B of 1.0 KB downloaded'
    );
    expect(harness.document.getElementById('modelLoadCurrentFileLabel')?.textContent).toBe(
      'second.onnx_data'
    );
    expect(harness.document.getElementById('modelLoadCurrentFileValue')?.textContent).toBe(
      '512 B / 1.0 KB'
    );
  });

  test('resets the visible progress bar when a new file starts downloading', () => {
    const harness = createHarness();

    harness.controller.showProgressRegion(true);
    harness.controller.setLoadProgress({
      percent: 100,
      message: 'Downloading model...',
      file: 'models/first.onnx',
      status: 'loaded',
      loadedBytes: 2048,
      totalBytes: 2048,
    });
    harness.controller.setLoadProgress({
      percent: 0,
      message: 'Downloading model...',
      file: 'models/second.onnx_data',
      status: 'loading',
      loadedBytes: 0,
      totalBytes: 1024,
    });

    expect(harness.document.getElementById('modelLoadProgressBar')?.style.width).toBe('0%');
    expect(harness.document.getElementById('modelLoadProgressValue')?.textContent).toBe(
      '0 B / 1.0 KB'
    );
    expect(harness.document.getElementById('modelLoadProgressBar')?.getAttribute('aria-valuetext')).toBe(
      'second.onnx_data: 0 B of 1.0 KB downloaded'
    );
    expect(harness.document.getElementById('modelLoadProgressSummary')?.textContent).toBe(
      '2.0 KB of 3.0 KB downloaded across 2 files'
    );
  });

  test('shows and clears structured load errors', () => {
    const harness = createHarness();

    harness.controller.showLoadError('Top level failure | Try again | Switch to CPU');

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
    ).toEqual(['Try again', 'Switch to CPU']);

    harness.controller.clearLoadError();

    expect(harness.document.getElementById('modelLoadError')?.classList.contains('d-none')).toBe(
      true
    );
    expect(harness.document.getElementById('modelLoadErrorSummary')?.textContent).toBe('');
    expect(harness.document.querySelectorAll('#modelLoadErrorDetails li')).toHaveLength(0);
  });

  test('moves the shared feedback block to the transcript host when requested', () => {
    const harness = createHarness();

    harness.controller.setFeedbackContext('transcript');
    harness.controller.showProgressRegion(true);

    expect(harness.document.getElementById('transcriptFeedbackHost')?.firstElementChild?.id).toBe(
      'modelLoadFeedback'
    );
  });
});
