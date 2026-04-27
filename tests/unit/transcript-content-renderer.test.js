import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  configureMathJaxWindow,
  containsMathDelimiters,
  createTranscriptContentRenderer,
  extractMathMlFromElement,
  normalizeMathDelimitersForMarkdown,
} from '../../src/app/transcript-content-renderer.js';
import { createAppState } from '../../src/state/app-state.js';

function createDom(markup = '') {
  return new JSDOM(markup, { url: 'https://example.test/' });
}

describe('transcript-content-renderer', () => {
  test('configures MathJax for deferred transcript typesetting', () => {
    const windowRef = {};

    configureMathJaxWindow(windowRef);

    expect(windowRef.MathJax.tex.inlineMath).toEqual([
      ['$', '$'],
      ['\\(', '\\)'],
    ]);
    expect(windowRef.MathJax.options.skipHtmlTags).toContain('code');
    expect(windowRef.MathJax.startup.typeset).toBe(false);
  });

  test('normalizes common math delimiters for Markdown rendering', () => {
    expect(normalizeMathDelimitersForMarkdown('Inline \\(x + 1\\).')).toBe('Inline $x + 1$.');
    expect(normalizeMathDelimitersForMarkdown('Block \\[x^2\\]')).toBe('Block \n$$\nx^2\n$$\n');
    expect(normalizeMathDelimitersForMarkdown('Line\n[\nx+y\n]')).toBe('Line\n$$\nx+y\n$$');

    expect(containsMathDelimiters('Price is $5')).toBe(true);
    expect(containsMathDelimiters('No math here')).toBe(false);
  });

  test('uses fallback Markdown first, then refreshes after Markdown renderer load', async () => {
    const appState = createAppState();
    const renderTranscript = vi.fn();
    const loadMarkdownRenderer = vi.fn().mockResolvedValue({
      render: (content) => `<rendered>${content}</rendered>`,
    });
    const renderer = createTranscriptContentRenderer({
      appState,
      windowRef: createDom().window,
      loadMarkdownRenderer,
      renderTranscript,
    });

    expect(renderer.renderModelMarkdown('**hello**')).toBe('<p>**hello**</p>');
    await renderer.ensureMarkdownRendererLoaded();

    expect(loadMarkdownRenderer).toHaveBeenCalledWith({
      linkRel: 'noopener noreferrer nofollow',
    });
    expect(renderTranscript).toHaveBeenCalledTimes(1);
    expect(renderer.renderModelMarkdown('**hello**')).toBe('<rendered>**hello**</rendered>');
  });

  test('logs Markdown renderer load failures once', async () => {
    const appendDebug = vi.fn();
    const renderer = createTranscriptContentRenderer({
      appState: createAppState(),
      windowRef: createDom().window,
      loadMarkdownRenderer: vi.fn().mockRejectedValue(new Error('load failed')),
      appendDebug,
    });

    await expect(renderer.ensureMarkdownRendererLoaded()).rejects.toThrow('load failed');
    await expect(renderer.ensureMarkdownRendererLoaded()).rejects.toThrow('load failed');

    expect(appendDebug).toHaveBeenCalledTimes(1);
    expect(appendDebug).toHaveBeenCalledWith('Markdown renderer failed to load: load failed');
  });

  test('typesets math when MathJax is ready and logs render failures once', async () => {
    const dom = createDom('<div id="math">$x$</div>');
    const element = dom.window.document.getElementById('math');
    const typesetPromise = vi.fn().mockResolvedValue(undefined);
    dom.window.MathJax = {
      startup: { promise: Promise.resolve() },
      typesetPromise,
    };
    const appState = createAppState();
    const renderer = createTranscriptContentRenderer({
      appState,
      windowRef: dom.window,
    });

    await renderer.typesetMathInElement(element);
    expect(typesetPromise).toHaveBeenCalledWith([element]);

    const appendDebug = vi.fn();
    dom.window.MathJax.typesetPromise = vi.fn().mockRejectedValue(new Error('typeset failed'));
    const failingRenderer = createTranscriptContentRenderer({
      appState: createAppState(),
      windowRef: dom.window,
      appendDebug,
    });

    await failingRenderer.typesetMathInElement(element);
    await failingRenderer.typesetMathInElement(element);

    expect(appendDebug).toHaveBeenCalledTimes(1);
    expect(appendDebug).toHaveBeenCalledWith('MathJax render failed: typeset failed');
  });

  test('loads MathJax once and logs load failures once', async () => {
    const appState = createAppState();
    const appendDebug = vi.fn();
    const loadMathJax = vi.fn().mockRejectedValue(new Error('network failed'));
    const renderer = createTranscriptContentRenderer({
      appState,
      windowRef: createDom().window,
      loadMathJax,
      appendDebug,
    });

    await renderer.ensureMathJaxLoaded();
    await renderer.ensureMathJaxLoaded();

    expect(loadMathJax).toHaveBeenCalledTimes(1);
    expect(appendDebug).toHaveBeenCalledTimes(1);
    expect(appendDebug).toHaveBeenCalledWith('MathJax failed to load: network failed');
  });

  test('extracts rendered MathML from assistive MathJax or native math nodes', () => {
    const dom = createDom(`
      <div id="assistive">
        <mjx-assistive-mml><math><mi>x</mi></math></mjx-assistive-mml>
      </div>
      <div id="native">
        <math><mi>y</mi></math>
      </div>
    `);

    expect(extractMathMlFromElement(dom.window.document.getElementById('assistive'))).toContain(
      '<mi>x</mi>'
    );
    expect(extractMathMlFromElement(dom.window.document.getElementById('native'))).toContain(
      '<mi>y</mi>'
    );
  });
});
