import {
  loadMarkdownRenderer as defaultLoadMarkdownRenderer,
  renderPlainTextMarkdownFallback,
} from '../ui/markdown-renderer.js';

const DEFAULT_MARKDOWN_LINK_REL = 'noopener noreferrer nofollow';
const DEFAULT_MATHJAX_TYPESET_DEBOUNCE_MS = 150;
const MATH_DELIMITER_PATTERN = /(^|[^\\])(\$\$|\$|\\\(|\\\[|\\begin\{)/;
const MATH_BLOCK_LINE_PATTERN = /(^|\n)\[\s*\n([\s\S]*?)\n\](?=\n|$)/g;
const MATH_DISPLAY_DELIMITER_PATTERN = /\\\[([\s\S]*?)\\\]/g;
const MATH_INLINE_DELIMITER_PATTERN = /\\\(([\s\S]*?)\\\)/g;

function isElementLike(value) {
  return Boolean(value && typeof value === 'object' && value.nodeType === 1);
}

export function configureMathJaxWindow(windowRef) {
  if (!windowRef || typeof windowRef !== 'object') {
    return null;
  }
  windowRef.MathJax = windowRef.MathJax || {};
  windowRef.MathJax.tex = {
    ...(windowRef.MathJax.tex || {}),
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)'],
    ],
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]'],
    ],
    processEscapes: true,
  };
  windowRef.MathJax.options = {
    ...(windowRef.MathJax.options || {}),
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
  };
  windowRef.MathJax.startup = {
    ...(windowRef.MathJax.startup || {}),
    typeset: false,
  };
  return windowRef.MathJax;
}

export function normalizeMathDelimitersForMarkdown(content) {
  if (!content) {
    return '';
  }
  return String(content)
    .replace(MATH_DISPLAY_DELIMITER_PATTERN, (_match, expression) => `\n$$\n${expression}\n$$\n`)
    .replace(MATH_INLINE_DELIMITER_PATTERN, (_match, expression) => `$${expression}$`)
    .replace(
      MATH_BLOCK_LINE_PATTERN,
      (_match, leading, expression) => `${leading}$$\n${expression}\n$$`
    );
}

export function containsMathDelimiters(text) {
  return MATH_DELIMITER_PATTERN.test(String(text || ''));
}

export function extractMathMlFromElement(element) {
  if (!isElementLike(element)) {
    return '';
  }
  const mathMlNodes = Array.from(element.querySelectorAll('mjx-assistive-mml math'));
  const fallbackNodes = mathMlNodes.length
    ? []
    : Array.from(element.querySelectorAll('math')).filter(
        (mathNode) => !mathNode.parentElement?.closest('math')
      );
  const nodesToSerialize = mathMlNodes.length ? mathMlNodes : fallbackNodes;
  if (!nodesToSerialize.length) {
    return '';
  }
  const XMLSerializerClass = element.ownerDocument?.defaultView?.XMLSerializer;
  if (typeof XMLSerializerClass !== 'function') {
    return '';
  }
  const serializer = new XMLSerializerClass();
  return nodesToSerialize
    .map((node) => serializer.serializeToString(node).trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * @param {{
 *   appState: any;
 *   windowRef?: any;
 *   markdownLinkRel?: string;
 *   mathJaxDebounceMs?: number;
 *   loadMarkdownRenderer?: typeof defaultLoadMarkdownRenderer;
 *   loadMathJax?: () => Promise<any>;
 *   appendDebug?: (message: string) => void;
 *   isGeneratingResponse?: () => boolean;
 *   renderTranscript?: () => void;
 * }} options
 */
export function createTranscriptContentRenderer({
  appState,
  windowRef = typeof window !== 'undefined' ? window : null,
  markdownLinkRel = DEFAULT_MARKDOWN_LINK_REL,
  mathJaxDebounceMs = DEFAULT_MATHJAX_TYPESET_DEBOUNCE_MS,
  loadMarkdownRenderer = defaultLoadMarkdownRenderer,
  loadMathJax = () => import('mathjax/es5/tex-mml-svg.js'),
  appendDebug = () => {},
  isGeneratingResponse = () => false,
  renderTranscript = () => {},
}) {
  const mathJaxWindow = windowRef || {};
  const typesetTimers = new WeakMap();
  let markdownRenderer = null;
  let markdownRendererLoadPromise = null;
  let hasQueuedMarkdownRendererRefresh = false;
  let hasLoggedMarkdownRendererError = false;

  configureMathJaxWindow(mathJaxWindow);

  function flushQueuedMarkdownRendererRefresh() {
    if (!hasQueuedMarkdownRendererRefresh || isGeneratingResponse()) {
      return;
    }
    hasQueuedMarkdownRendererRefresh = false;
    renderTranscript();
  }

  function queueMarkdownRendererRefresh() {
    if (hasQueuedMarkdownRendererRefresh) {
      return;
    }
    hasQueuedMarkdownRendererRefresh = true;
    flushQueuedMarkdownRendererRefresh();
  }

  async function ensureMarkdownRendererLoaded() {
    if (markdownRenderer) {
      return markdownRenderer;
    }
    if (!markdownRendererLoadPromise) {
      markdownRendererLoadPromise = loadMarkdownRenderer({
        linkRel: markdownLinkRel,
      })
        .then((loadedRenderer) => {
          markdownRenderer = loadedRenderer;
          queueMarkdownRendererRefresh();
          return loadedRenderer;
        })
        .catch((error) => {
          markdownRendererLoadPromise = null;
          if (!hasLoggedMarkdownRendererError) {
            appendDebug(
              `Markdown renderer failed to load: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            hasLoggedMarkdownRendererError = true;
          }
          throw error;
        });
    }
    return markdownRendererLoadPromise;
  }

  function renderModelMarkdown(content) {
    const normalizedContent = appState.renderMathMl
      ? normalizeMathDelimitersForMarkdown(String(content || ''))
      : String(content || '');
    if (!normalizedContent) {
      return '';
    }
    if (markdownRenderer) {
      return markdownRenderer.render(normalizedContent);
    }
    void ensureMarkdownRendererLoaded();
    return renderPlainTextMarkdownFallback(normalizedContent);
  }

  function ensureMathJaxLoaded() {
    if (!appState.renderMathMl) {
      return Promise.resolve();
    }
    if (mathJaxWindow.MathJax?.typesetPromise && mathJaxWindow.MathJax?.startup?.promise) {
      return Promise.resolve();
    }
    if (!appState.mathJaxLoadPromise) {
      appState.mathJaxLoadPromise = loadMathJax().catch((error) => {
        if (!appState.hasLoggedMathJaxError) {
          appendDebug(
            `MathJax failed to load: ${error instanceof Error ? error.message : String(error)}`
          );
          appState.hasLoggedMathJaxError = true;
        }
      });
    }
    return appState.mathJaxLoadPromise;
  }

  async function typesetMathInElement(element) {
    if (
      !appState.renderMathMl ||
      !isElementLike(element) ||
      !containsMathDelimiters(element.textContent)
    ) {
      return;
    }
    await ensureMathJaxLoaded();
    const mathJax = mathJaxWindow.MathJax;
    if (!mathJax?.typesetPromise || !mathJax.startup?.promise) {
      return;
    }
    try {
      await mathJax.startup.promise;
      await mathJax.typesetPromise([element]);
    } catch (error) {
      if (!appState.hasLoggedMathJaxError) {
        appendDebug(
          `MathJax render failed: ${error instanceof Error ? error.message : String(error)}`
        );
        appState.hasLoggedMathJaxError = true;
      }
    }
  }

  function scheduleMathTypeset(element, options = {}) {
    if (
      !appState.renderMathMl ||
      !isElementLike(element) ||
      !containsMathDelimiters(element.textContent)
    ) {
      if (isElementLike(element)) {
        const timerId = typesetTimers.get(element);
        if (timerId !== undefined) {
          mathJaxWindow.clearTimeout(timerId);
          typesetTimers.delete(element);
        }
      }
      return;
    }

    const timerId = typesetTimers.get(element);
    if (timerId !== undefined) {
      mathJaxWindow.clearTimeout(timerId);
      typesetTimers.delete(element);
    }
    if (options.immediate) {
      void typesetMathInElement(element);
      return;
    }
    const nextTimerId = mathJaxWindow.setTimeout(() => {
      typesetTimers.delete(element);
      void typesetMathInElement(element);
    }, mathJaxDebounceMs);
    typesetTimers.set(element, nextTimerId);
  }

  return {
    containsMathDelimiters,
    ensureMarkdownRendererLoaded,
    ensureMathJaxLoaded,
    extractMathMlFromElement,
    flushQueuedMarkdownRendererRefresh,
    normalizeMathDelimitersForMarkdown,
    renderModelMarkdown,
    scheduleMathTypeset,
    shouldShowMathMlCopyAction: (content) =>
      Boolean(appState.renderMathMl && containsMathDelimiters(content)),
    typesetMathInElement,
  };
}
