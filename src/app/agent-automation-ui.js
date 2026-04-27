import { hasStartedWorkspace, isSettingsView } from '../state/app-state.js';
import { isAgentConversation } from '../state/conversation-model.js';

function isElementOfType(value, typeName) {
  const view = value?.ownerDocument?.defaultView || globalThis;
  const TypeCtor = view?.[typeName];
  return typeof TypeCtor === 'function' && value instanceof TypeCtor;
}

export function formatAgentFollowUpCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function formatAgentFollowUpAnnouncement(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  }
  if (!hours && (!minutes || seconds > 0)) {
    parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  }
  return parts.join(' ');
}

/**
 * @param {{
 *   appState: any;
 *   agentAutomationControls?: any;
 *   pauseAgentBtn?: any;
 *   agentFollowUpCountdown?: any;
 *   agentFollowUpCountdownText?: any;
 *   agentFollowUpAutomationHelp?: any;
 *   agentFollowUpCountdownLive?: any;
 *   getActiveConversation?: () => any;
 *   getAgentDisplayName?: (conversation?: any) => string;
 *   isUiBusy?: () => boolean;
 *   isFollowUpRunning?: (conversation?: any) => boolean;
 *   toggleAgentPauseState?: () => any;
 *   initializeTooltips?: (root?: any) => void;
 *   disposeTooltipFor?: (element: any) => void;
 *   now?: () => number;
 *   setIntervalRef?: ((callback: () => void, delay?: number) => any) | null;
 *   clearIntervalRef?: ((timerId: any) => void) | null;
 * }} options
 */
export function createAgentAutomationUiController({
  appState,
  agentAutomationControls = null,
  pauseAgentBtn = null,
  agentFollowUpCountdown = null,
  agentFollowUpCountdownText = null,
  agentFollowUpAutomationHelp = null,
  agentFollowUpCountdownLive = null,
  getActiveConversation = () => null,
  getAgentDisplayName = () => 'Agent',
  isUiBusy = () => false,
  isFollowUpRunning = () => false,
  toggleAgentPauseState = () => {},
  initializeTooltips = () => {},
  disposeTooltipFor = () => {},
  now = () => Date.now(),
  setIntervalRef = globalThis.setInterval?.bind(globalThis),
  clearIntervalRef = globalThis.clearInterval?.bind(globalThis),
}) {
  let agentFollowUpCountdownIntervalId = null;
  let lastAgentFollowUpAnnouncementKey = '';

  function shouldShowAgentAutomationControls(conversation = getActiveConversation()) {
    return (
      isAgentConversation(conversation) &&
      !appState.isPreparingNewConversation &&
      hasStartedWorkspace(appState) &&
      !isSettingsView(appState)
    );
  }

  function clearAgentFollowUpCountdownTimer() {
    if (agentFollowUpCountdownIntervalId !== null) {
      clearIntervalRef?.(agentFollowUpCountdownIntervalId);
      agentFollowUpCountdownIntervalId = null;
    }
  }

  function startAgentFollowUpCountdownTimer() {
    if (agentFollowUpCountdownIntervalId !== null || typeof setIntervalRef !== 'function') {
      return;
    }
    agentFollowUpCountdownIntervalId = setIntervalRef(() => {
      updateAgentFollowUpCountdownUi();
    }, 1000);
  }

  function updateAgentFollowUpCountdownUi() {
    const activeConversation = getActiveConversation();
    const showControls = shouldShowAgentAutomationControls(activeConversation);
    if (
      !isElementOfType(agentFollowUpCountdown, 'HTMLElement') ||
      !isElementOfType(agentFollowUpCountdownText, 'HTMLElement')
    ) {
      clearAgentFollowUpCountdownTimer();
      return;
    }
    if (!showControls || !activeConversation?.agent) {
      agentFollowUpCountdown.classList.add('d-none');
      agentFollowUpCountdownText.textContent = '--';
      if (isElementOfType(agentFollowUpCountdownLive, 'HTMLElement')) {
        agentFollowUpCountdownLive.textContent = '';
      }
      lastAgentFollowUpAnnouncementKey = '';
      clearAgentFollowUpCountdownTimer();
      return;
    }
    agentFollowUpCountdown.classList.remove('d-none');
    const isPaused = activeConversation.agent.paused === true;
    const isRunning = isFollowUpRunning(activeConversation) === true;
    const nextFollowUpAt = Number(activeConversation.agent.nextFollowUpAt) || 0;
    let valueText = 'waiting';
    let announcementText = '';
    let announcementKey = `${activeConversation.id}:idle`;
    const shouldTick =
      !isPaused && !isRunning && Number.isFinite(nextFollowUpAt) && nextFollowUpAt > 0;

    if (isPaused) {
      valueText = 'paused';
      announcementKey = `${activeConversation.id}:paused`;
      announcementText = `${getAgentDisplayName(activeConversation)} automatic heartbeats are paused.`;
    } else if (isRunning) {
      valueText = 'sending now';
      announcementKey = `${activeConversation.id}:running`;
      announcementText = `${getAgentDisplayName(activeConversation)} is sending a heartbeat now.`;
    } else if (shouldTick) {
      const remainingMs = Math.max(0, nextFollowUpAt - now());
      valueText =
        remainingMs <= 1000 ? 'due now' : `in ${formatAgentFollowUpCountdown(remainingMs)}`;
      announcementKey = `${activeConversation.id}:scheduled:${Math.trunc(nextFollowUpAt / 1000)}`;
      announcementText = `${getAgentDisplayName(activeConversation)} may send the next heartbeat in about ${formatAgentFollowUpAnnouncement(
        remainingMs
      )}.`;
    } else {
      valueText = 'scheduling...';
      announcementKey = `${activeConversation.id}:scheduling`;
      announcementText = `${getAgentDisplayName(activeConversation)} will schedule the next heartbeat after the current activity settles.`;
    }

    agentFollowUpCountdownText.textContent = valueText;
    if (
      isElementOfType(agentFollowUpCountdownLive, 'HTMLElement') &&
      announcementKey !== lastAgentFollowUpAnnouncementKey
    ) {
      agentFollowUpCountdownLive.textContent = announcementText;
      lastAgentFollowUpAnnouncementKey = announcementKey;
    }
    if (shouldTick) {
      startAgentFollowUpCountdownTimer();
    } else {
      clearAgentFollowUpCountdownTimer();
    }
  }

  function updatePauseAgentButton() {
    if (!isElementOfType(pauseAgentBtn, 'HTMLButtonElement')) {
      clearAgentFollowUpCountdownTimer();
      return;
    }
    const activeConversation = getActiveConversation();
    const showButton = shouldShowAgentAutomationControls(activeConversation);
    if (isElementOfType(agentAutomationControls, 'HTMLElement')) {
      agentAutomationControls.classList.toggle('d-none', !showButton);
    } else {
      pauseAgentBtn.classList.toggle('d-none', !showButton);
    }
    if (!showButton) {
      pauseAgentBtn.disabled = true;
      pauseAgentBtn.removeAttribute('aria-describedby');
      updateAgentFollowUpCountdownUi();
      return;
    }
    const isPaused = activeConversation?.agent?.paused === true;
    pauseAgentBtn.disabled = isUiBusy();
    pauseAgentBtn.setAttribute('aria-pressed', String(isPaused));
    const buttonLabel = isPaused ? 'Resume agent' : 'Pause agent';
    pauseAgentBtn.setAttribute('aria-label', buttonLabel);
    pauseAgentBtn.setAttribute('data-bs-title', buttonLabel);
    pauseAgentBtn.title = buttonLabel;
    const describedBy = [agentFollowUpAutomationHelp, agentFollowUpCountdown]
      .filter((element) => isElementOfType(element, 'HTMLElement'))
      .map((element) => element.id)
      .join(' ');
    if (describedBy) {
      pauseAgentBtn.setAttribute('aria-describedby', describedBy);
    } else {
      pauseAgentBtn.removeAttribute('aria-describedby');
    }
    const icon = pauseAgentBtn.querySelector('[data-agent-toggle-icon="true"]');
    if (isElementOfType(icon, 'HTMLElement')) {
      icon.className = `bi ${isPaused ? 'bi-play-fill' : 'bi-pause-fill'}`;
    }
    updateAgentFollowUpCountdownUi();
    disposeTooltipFor(pauseAgentBtn);
    initializeTooltips(pauseAgentBtn.parentElement || pauseAgentBtn);
  }

  function bindEvents() {
    if (!isElementOfType(pauseAgentBtn, 'HTMLButtonElement')) {
      return () => {};
    }
    const handlePauseAgentClick = () => {
      toggleAgentPauseState();
    };
    pauseAgentBtn.addEventListener('click', handlePauseAgentClick);
    return () => {
      pauseAgentBtn.removeEventListener('click', handlePauseAgentClick);
    };
  }

  return {
    bindEvents,
    clearAgentFollowUpCountdownTimer,
    shouldShowAgentAutomationControls,
    updateAgentFollowUpCountdownUi,
    updatePauseAgentButton,
  };
}
