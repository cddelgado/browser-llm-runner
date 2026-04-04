/**
 * @param {{
 *   panel?: HTMLElement | null;
 *   frame?: HTMLElement | null;
 *   title?: HTMLElement | null;
 *   description?: HTMLElement | null;
 * }} options
 */
export function createBrowserView({ panel, frame, title, description } = {}) {
  if (!(frame instanceof HTMLElement) || frame.tagName !== 'IFRAME') {
    throw new Error('A browser frame element is required.');
  }

  let lastFingerprint = '';

  function setVisible(visible) {
    if (panel instanceof HTMLElement) {
      panel.classList.toggle('d-none', !visible);
    }
  }

  function renderSession({ heading = '', details = '', url = '' } = {}) {
    const fingerprint = JSON.stringify({
      heading: typeof heading === 'string' ? heading : '',
      details: typeof details === 'string' ? details : '',
      url: typeof url === 'string' ? url : '',
    });
    if (fingerprint === lastFingerprint) {
      return;
    }
    lastFingerprint = fingerprint;

    if (title instanceof HTMLElement) {
      title.textContent = heading || 'Web search';
    }
    if (description instanceof HTMLElement) {
      description.textContent =
        details || 'External search page opened for this lookup.';
    }
    if (typeof url === 'string' && url.trim() && frame.src !== url.trim()) {
      frame.src = url.trim();
    }
  }

  return {
    renderSession,
    setVisible,
  };
}
