import { describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderTaskListTray } from '../../src/ui/task-list-tray.js';

describe('task-list-tray', () => {
  test('renders a compact pending-first preview and toggle control', () => {
    const dom = new JSDOM('<div id="tray"></div>');
    const container = dom.window.document.getElementById('tray');
    const onToggle = vi.fn();

    renderTaskListTray({
      container,
      items: [
        { text: 'Completed first', status: 1 },
        { text: 'Pending second', status: 0 },
        { text: 'Pending third', status: 0 },
      ],
      isExpanded: false,
      onToggle,
    });

    expect(container?.classList.contains('d-none')).toBe(false);
    expect(container?.dataset.hasItems).toBe('true');
    expect(
      Array.from(container?.querySelectorAll('.task-list-item-text') || []).map((node) => node.textContent)
    ).toEqual(['Pending second', 'Pending third']);
    expect(container?.textContent).toContain('+1 more');

    container?.querySelector('.task-list-tray-toggle')?.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true })
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('renders the full expanded list with completed items visually last', () => {
    const dom = new JSDOM('<div id="tray"></div>');
    const container = dom.window.document.getElementById('tray');

    renderTaskListTray({
      container,
      items: [
        { text: 'Done item', status: 1 },
        { text: 'Pending item', status: 0 },
      ],
      isExpanded: true,
    });

    expect(container?.classList.contains('is-expanded')).toBe(true);
    expect(
      Array.from(container?.querySelectorAll('.task-list-item-text') || []).map((node) => node.textContent)
    ).toEqual(['Pending item', 'Done item']);
    expect(container?.querySelector('[data-task-status="pending"] .bi-circle')).not.toBeNull();
    expect(container?.querySelector('[data-task-status="done"] .bi-check-circle-fill')).not.toBeNull();
  });

  test('hides the tray when there are no items', () => {
    const dom = new JSDOM('<div id="tray"></div>');
    const container = dom.window.document.getElementById('tray');

    renderTaskListTray({
      container,
      items: [],
    });

    expect(container?.classList.contains('d-none')).toBe(true);
    expect(container?.childElementCount).toBe(0);
    expect(container?.dataset.hasItems).toBe('false');
  });
});
