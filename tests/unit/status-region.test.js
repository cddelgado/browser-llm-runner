import { describe, expect, test } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyStatusRegion, getStatusTone } from '../../src/app/status-region.js';

function createStatusDom() {
  const dom = new JSDOM(`
    <div id="status" class="alert alert-secondary d-none" role="status" aria-live="polite">
      <strong id="heading">Chat status</strong>
      <span id="message"></span>
    </div>
  `);
  const documentRef = dom.window.document;
  return {
    region: documentRef.getElementById('status'),
    heading: documentRef.getElementById('heading'),
    message: documentRef.getElementById('message'),
  };
}

describe('status-region', () => {
  test('classifies error, progress, success, and neutral messages', () => {
    expect(getStatusTone('Copy failed.')).toMatchObject({
      heading: 'Chat error',
      variant: 'danger',
      role: 'status',
      live: 'polite',
    });
    expect(getStatusTone('Loading model files...')).toMatchObject({
      variant: 'warning',
      role: 'status',
      live: 'polite',
    });
    expect(getStatusTone('Conversation saved.')).toMatchObject({
      variant: 'success',
      role: 'status',
      live: 'polite',
    });
    expect(getStatusTone('Waiting for input.')).toMatchObject({
      variant: 'secondary',
      role: 'status',
      live: 'polite',
    });
  });

  test('applies accessible status tone and heading override', () => {
    const { region, heading, message } = createStatusDom();

    applyStatusRegion(region, heading, message, 'Copy failed.', 'Setup status');

    expect(region?.classList.contains('d-none')).toBe(false);
    expect(region?.classList.contains('alert-danger')).toBe(true);
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(heading?.textContent).toBe('Setup status');
    expect(message?.textContent).toBe('Copy failed.');
  });

  test('hides an empty status without clearing the previous heading', () => {
    const { region, heading, message } = createStatusDom();

    applyStatusRegion(region, heading, message, 'Ready.', 'Setup status');
    applyStatusRegion(region, heading, message, '   ');

    expect(region?.classList.contains('d-none')).toBe(true);
    expect(heading?.textContent).toBe('Setup status');
    expect(message?.textContent).toBe('');
  });
});
