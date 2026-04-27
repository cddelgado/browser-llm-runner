import { JSDOM } from 'jsdom';
import { describe, expect, test, vi } from 'vitest';
import {
  createAgentAutomationUiController,
  formatAgentFollowUpAnnouncement,
  formatAgentFollowUpCountdown,
} from '../../src/app/agent-automation-ui.js';
import { createAppState } from '../../src/state/app-state.js';

function createAgentConversation(overrides = {}) {
  return {
    id: 'conversation-agent',
    conversationType: 'agent',
    name: 'Research Partner',
    agent: {
      name: 'Research Partner',
      description: 'Helpful and proactive.',
      paused: false,
      nextFollowUpAt: 61_000,
      ...overrides.agent,
    },
    ...overrides,
  };
}

function createHarness({
  conversation = createAgentConversation(),
  isFollowUpRunning = false,
} = {}) {
  const dom = new JSDOM(`<!doctype html>
    <section id="agentAutomationControls" class="d-none">
      <p id="agentFollowUpAutomationHelp">Automatic heartbeat schedule.</p>
      <button id="pauseAgentBtn" type="button">
        <span data-agent-toggle-icon="true"></span>
      </button>
      <span id="agentFollowUpCountdown" class="d-none">
        <span id="agentFollowUpCountdownText">--</span>
      </span>
      <span id="agentFollowUpCountdownLive" aria-live="polite"></span>
    </section>`);
  const document = dom.window.document;
  const appState = createAppState();
  appState.hasStartedChatWorkspace = true;
  const activeConversationRef = { value: conversation };
  const nowRef = { value: 1_000 };
  const intervals = [];
  const clearedIntervals = [];
  const dependencies = {
    isUiBusy: vi.fn(() => false),
    isFollowUpRunning: vi.fn(() => isFollowUpRunning),
    toggleAgentPauseState: vi.fn(),
    initializeTooltips: vi.fn(),
    disposeTooltipFor: vi.fn(),
    setIntervalRef: vi.fn((callback, delay = 0) => {
      const timer = { callback, delay, cleared: false };
      intervals.push(timer);
      return timer;
    }),
    clearIntervalRef: vi.fn((timer) => {
      if (timer) {
        timer.cleared = true;
        clearedIntervals.push(timer);
      }
    }),
  };
  const controller = createAgentAutomationUiController({
    appState,
    agentAutomationControls: document.getElementById('agentAutomationControls'),
    pauseAgentBtn: document.getElementById('pauseAgentBtn'),
    agentFollowUpCountdown: document.getElementById('agentFollowUpCountdown'),
    agentFollowUpCountdownText: document.getElementById('agentFollowUpCountdownText'),
    agentFollowUpAutomationHelp: document.getElementById('agentFollowUpAutomationHelp'),
    agentFollowUpCountdownLive: document.getElementById('agentFollowUpCountdownLive'),
    getActiveConversation: () => activeConversationRef.value,
    getAgentDisplayName: (activeConversation = activeConversationRef.value) =>
      activeConversation?.agent?.name || 'Agent',
    isUiBusy: dependencies.isUiBusy,
    isFollowUpRunning: dependencies.isFollowUpRunning,
    toggleAgentPauseState: dependencies.toggleAgentPauseState,
    initializeTooltips: dependencies.initializeTooltips,
    disposeTooltipFor: dependencies.disposeTooltipFor,
    now: () => nowRef.value,
    setIntervalRef: dependencies.setIntervalRef,
    clearIntervalRef: dependencies.clearIntervalRef,
  });

  return {
    appState,
    document,
    activeConversationRef,
    nowRef,
    intervals,
    clearedIntervals,
    dependencies,
    controller,
  };
}

describe('agent-automation-ui', () => {
  test('formats countdown and live-region durations', () => {
    expect(formatAgentFollowUpCountdown(3_661_000)).toBe('1h 01m');
    expect(formatAgentFollowUpCountdown(61_000)).toBe('1m 01s');
    expect(formatAgentFollowUpCountdown(900)).toBe('1s');
    expect(formatAgentFollowUpAnnouncement(3_661_000)).toBe('1 hour 1 minute');
    expect(formatAgentFollowUpAnnouncement(61_000)).toBe('1 minute 1 second');
    expect(formatAgentFollowUpAnnouncement(900)).toBe('1 second');
  });

  test('shows scheduled agent controls and starts the countdown tick', () => {
    const harness = createHarness();

    harness.controller.updatePauseAgentButton();

    const controls = harness.document.getElementById('agentAutomationControls');
    const pauseButton = harness.document.getElementById('pauseAgentBtn');
    const countdown = harness.document.getElementById('agentFollowUpCountdown');
    const countdownText = harness.document.getElementById('agentFollowUpCountdownText');
    const countdownLive = harness.document.getElementById('agentFollowUpCountdownLive');
    const icon = pauseButton?.querySelector('[data-agent-toggle-icon="true"]');

    expect(controls?.classList.contains('d-none')).toBe(false);
    expect(countdown?.classList.contains('d-none')).toBe(false);
    expect(countdownText?.textContent).toBe('in 1m 00s');
    expect(countdownLive?.textContent).toBe(
      'Research Partner may send the next heartbeat in about 1 minute.'
    );
    expect(pauseButton?.tagName).toBe('BUTTON');
    expect(/** @type {HTMLButtonElement} */ (pauseButton).disabled).toBe(false);
    expect(pauseButton?.getAttribute('aria-pressed')).toBe('false');
    expect(pauseButton?.getAttribute('aria-label')).toBe('Pause agent');
    expect(pauseButton?.getAttribute('aria-describedby')).toBe(
      'agentFollowUpAutomationHelp agentFollowUpCountdown'
    );
    expect(icon?.className).toBe('bi bi-pause-fill');
    expect(harness.dependencies.disposeTooltipFor.mock.calls[0]?.[0]).toBe(pauseButton);
    expect(harness.dependencies.initializeTooltips.mock.calls[0]?.[0]).toBe(controls);
    expect(harness.intervals).toHaveLength(1);
    expect(harness.intervals[0].delay).toBe(1000);
  });

  test('throttles repeated live-region announcements for the same schedule', () => {
    const harness = createHarness();

    harness.controller.updateAgentFollowUpCountdownUi();
    const countdownLive = harness.document.getElementById('agentFollowUpCountdownLive');
    expect(countdownLive?.textContent).toContain('about 1 minute');

    countdownLive.textContent = 'previous announcement';
    harness.nowRef.value = 2_000;
    harness.controller.updateAgentFollowUpCountdownUi();

    expect(countdownLive.textContent).toBe('previous announcement');
    expect(harness.intervals).toHaveLength(1);
  });

  test('shows paused state and clears an active countdown timer', () => {
    const conversation = createAgentConversation();
    const harness = createHarness({ conversation });
    harness.controller.updateAgentFollowUpCountdownUi();

    conversation.agent.paused = true;
    harness.controller.updatePauseAgentButton();

    const pauseButton = harness.document.getElementById('pauseAgentBtn');
    const countdownText = harness.document.getElementById('agentFollowUpCountdownText');
    const countdownLive = harness.document.getElementById('agentFollowUpCountdownLive');
    const icon = pauseButton?.querySelector('[data-agent-toggle-icon="true"]');

    expect(countdownText?.textContent).toBe('paused');
    expect(countdownLive?.textContent).toBe('Research Partner automatic heartbeats are paused.');
    expect(pauseButton?.getAttribute('aria-pressed')).toBe('true');
    expect(pauseButton?.getAttribute('aria-label')).toBe('Resume agent');
    expect(icon?.className).toBe('bi bi-play-fill');
    expect(harness.clearedIntervals).toHaveLength(1);
    expect(harness.intervals[0].cleared).toBe(true);
  });

  test('shows running state without scheduling a countdown tick', () => {
    const harness = createHarness({ isFollowUpRunning: true });

    harness.controller.updatePauseAgentButton();

    const countdownText = harness.document.getElementById('agentFollowUpCountdownText');
    const countdownLive = harness.document.getElementById('agentFollowUpCountdownLive');

    expect(countdownText?.textContent).toBe('sending now');
    expect(countdownLive?.textContent).toBe('Research Partner is sending a heartbeat now.');
    expect(harness.intervals).toHaveLength(0);
  });

  test('hides controls and clears announcements outside an active agent workspace', () => {
    const harness = createHarness();
    harness.controller.updateAgentFollowUpCountdownUi();
    harness.appState.isSettingsPageOpen = true;

    harness.controller.updatePauseAgentButton();

    const controls = harness.document.getElementById('agentAutomationControls');
    const pauseButton = harness.document.getElementById('pauseAgentBtn');
    const countdown = harness.document.getElementById('agentFollowUpCountdown');
    const countdownText = harness.document.getElementById('agentFollowUpCountdownText');
    const countdownLive = harness.document.getElementById('agentFollowUpCountdownLive');

    expect(controls?.classList.contains('d-none')).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (pauseButton).disabled).toBe(true);
    expect(pauseButton?.hasAttribute('aria-describedby')).toBe(false);
    expect(countdown?.classList.contains('d-none')).toBe(true);
    expect(countdownText?.textContent).toBe('--');
    expect(countdownLive?.textContent).toBe('');
    expect(harness.clearedIntervals).toHaveLength(1);
  });

  test('binds and unbinds the pause button click handler', () => {
    const harness = createHarness();
    const pauseButton = harness.document.getElementById('pauseAgentBtn');
    const unbind = harness.controller.bindEvents();

    pauseButton?.click();
    expect(harness.dependencies.toggleAgentPauseState).toHaveBeenCalledTimes(1);

    unbind();
    pauseButton?.click();
    expect(harness.dependencies.toggleAgentPauseState).toHaveBeenCalledTimes(1);
  });
});
