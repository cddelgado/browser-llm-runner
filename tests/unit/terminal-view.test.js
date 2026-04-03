import { beforeEach, describe, expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const terminalState = {
  fitCalls: 0,
  resetCalls: 0,
  openCalls: 0,
  writes: [],
  resizeObservers: [],
};

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit() {
      terminalState.fitCalls += 1;
    }
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    loadAddon() {}
    open() {
      terminalState.openCalls += 1;
    }
    reset() {
      terminalState.resetCalls += 1;
    }
    write(value) {
      terminalState.writes.push(['write', value]);
    }
    writeln(value) {
      terminalState.writes.push(['writeln', value]);
    }
    scrollToBottom() {}
    dispose() {}
  },
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

function createWindowRef(_window) {
  class MockResizeObserver {
    constructor(callback) {
      this.callback = callback;
      terminalState.resizeObservers.push(this);
    }

    observe() {}

    disconnect() {}
  }

  return {
    ResizeObserver: MockResizeObserver,
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
  };
}

beforeEach(() => {
  terminalState.fitCalls = 0;
  terminalState.resetCalls = 0;
  terminalState.openCalls = 0;
  terminalState.writes = [];
  terminalState.resizeObservers = [];
});

describe('terminal-view', () => {
  test('does not refit repeatedly when visibility is unchanged', async () => {
    const dom = new JSDOM('<div id="panel" class="d-none"><div id="host"></div></div>');
    globalThis.HTMLElement = dom.window.HTMLElement;
    const { createTerminalView } = await import('../../src/ui/terminal-view.js');
    const view = createTerminalView({
      panel: dom.window.document.getElementById('panel'),
      host: dom.window.document.getElementById('host'),
      windowRef: createWindowRef(dom.window),
    });

    view.setVisible(true);
    view.setVisible(true);

    expect(terminalState.fitCalls).toBe(1);
  });

  test('skips terminal replay when the session fingerprint is unchanged', async () => {
    const dom = new JSDOM('<div id="panel"><div id="host"></div></div>');
    globalThis.HTMLElement = dom.window.HTMLElement;
    const { createTerminalView } = await import('../../src/ui/terminal-view.js');
    const view = createTerminalView({
      panel: dom.window.document.getElementById('panel'),
      host: dom.window.document.getElementById('host'),
      windowRef: createWindowRef(dom.window),
    });

    const session = {
      sessionKey: 'conversation-1:leaf-1:1',
      currentWorkingDirectory: '/workspace',
      entries: [
        {
          command: 'pwd',
          currentWorkingDirectory: '/workspace',
          stdout: '/workspace',
          stderr: '',
          exitCode: 0,
        },
      ],
      pendingEntry: null,
    };

    view.renderSession(session);
    view.renderSession(session);

    expect(terminalState.resetCalls).toBe(1);
  });

  test('renders command history, stderr, pending entries, and the live prompt', async () => {
    const dom = new JSDOM('<div id="panel"><div id="host"></div></div>');
    globalThis.HTMLElement = dom.window.HTMLElement;
    const { createTerminalView } = await import('../../src/ui/terminal-view.js');
    const view = createTerminalView({
      panel: dom.window.document.getElementById('panel'),
      host: dom.window.document.getElementById('host'),
      windowRef: createWindowRef(dom.window),
    });

    view.renderSession({
      sessionKey: 'conversation-1:leaf-2:2',
      currentWorkingDirectory: '/workspace/coursework',
      entries: [
        {
          command: 'pwd',
          currentWorkingDirectory: '/workspace',
          stdout: '/workspace',
          stderr: '',
          exitCode: 0,
        },
        {
          command: 'ls missing',
          currentWorkingDirectory: '/workspace/coursework',
          stdout: '',
          stderr: "ls: cannot access 'missing': No such file or directory.",
          exitCode: 1,
        },
      ],
      pendingEntry: {
        command: 'cat notes.txt',
        currentWorkingDirectory: '/workspace/coursework',
      },
    });

    expect(terminalState.resetCalls).toBe(1);
    expect(terminalState.writes).toEqual([
      ['write', '/workspace $ '],
      ['writeln', 'pwd'],
      ['write', '/workspace\n'],
      ['write', '/workspace/coursework $ '],
      ['writeln', 'ls missing'],
      ['write', "\u001b[31mls: cannot access 'missing': No such file or directory.\n\u001b[39m"],
      ['write', '/workspace/coursework $ '],
      ['writeln', 'cat notes.txt'],
      ['write', '/workspace/coursework $ '],
    ]);
  });
});
