import { describe, expect, test } from 'vitest';
import {
  ENGINE_PHASES,
  INTERACTION_MODES,
  ORCHESTRATION_STATUSES,
  WORKSPACE_VIEWS,
  clearUserMessageEditState,
  createAppState,
  deriveEnginePhase,
  findConversationById,
  getActiveConversation,
  getCurrentViewRoute,
  hasSelectedConversationWithHistory,
  refreshWorkspaceView,
  setChatTitleEditing,
  setGenerating,
  setLoadingModel,
  setModelReady,
  setOrchestrationRunning,
  setPreparingNewConversation,
  setSettingsPageOpen,
  setSwitchingVariant,
  setUserMessageEditState,
  shouldDisableConversationControls,
  shouldShowNewConversationButton,
  shouldDisableComposerForPreChatConversationSelection,
} from '../../src/state/app-state.js';

describe('app-state', () => {
  test('creates centralized mutable app state with defaults', () => {
    const state = createAppState({
      activeGenerationConfig: { maxOutputTokens: 128 },
      defaultSystemPrompt: 'Be concise.',
      maxDebugEntries: 42,
    });

    expect(state.activeGenerationConfig).toEqual({ maxOutputTokens: 128 });
    expect(state.defaultSystemPrompt).toBe('Be concise.');
    expect(state.maxDebugEntries).toBe(42);
    expect(state.conversations).toEqual([]);
    expect(state.debugEntries).toEqual([]);
    expect(state.enginePhase).toBe(ENGINE_PHASES.IDLE);
    expect(state.workspaceView).toBe(WORKSPACE_VIEWS.HOME);
    expect(state.interactionMode).toBe(INTERACTION_MODES.NONE);
    expect(state.orchestrationStatus).toBe(ORCHESTRATION_STATUSES.IDLE);
  });

  test('returns active and selected conversations through selectors', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });
    state.conversations.push(
      { id: 'conversation-1', activeLeafMessageId: null, messageNodes: [] },
      {
        id: 'conversation-2',
        activeLeafMessageId: 'message-1',
        messageNodes: [{ id: 'message-1', role: 'user', parentId: null }],
      },
    );
    state.activeConversationId = 'conversation-2';

    expect(getActiveConversation(state)?.id).toBe('conversation-2');
    expect(findConversationById(state, 'conversation-1')?.id).toBe('conversation-1');
    expect(hasSelectedConversationWithHistory(state)).toBe(true);
  });

  test('derives current view and pre-chat composer state from centralized state', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });
    state.hasStartedChatWorkspace = true;
    state.isSettingsPageOpen = false;
    state.modelReady = false;
    state.activeConversationId = 'conversation-1';
    state.conversations.push({
      id: 'conversation-1',
      activeLeafMessageId: 'message-1',
      messageNodes: [{ id: 'message-1', role: 'user', parentId: null }],
    });

    expect(
      getCurrentViewRoute(state, {
        routeHome: 'home',
        routeChat: 'chat',
        routeSettings: 'settings',
      }),
    ).toBe('chat');
    expect(shouldDisableComposerForPreChatConversationSelection(state)).toBe(false);

    state.isSettingsPageOpen = true;
    expect(
      getCurrentViewRoute(state, {
        routeHome: 'home',
        routeChat: 'chat',
        routeSettings: 'settings',
      }),
    ).toBe('settings');
  });

  test('does not disable the composer outside the pre-chat view', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });
    state.hasStartedChatWorkspace = true;
    state.activeConversationId = 'conversation-1';
    state.conversations.push({
      id: 'conversation-1',
      activeLeafMessageId: 'message-1',
      messageNodes: [{ id: 'message-1', role: 'user', parentId: null }],
    });

    state.isGenerating = true;
    expect(shouldDisableComposerForPreChatConversationSelection(state)).toBe(false);

    state.isGenerating = false;
    state.modelReady = true;
    expect(shouldDisableComposerForPreChatConversationSelection(state)).toBe(false);
  });

  test('shows new conversation after the launch page is dismissed', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });
    expect(shouldShowNewConversationButton(state)).toBe(false);

    state.hasStartedChatWorkspace = true;
    expect(shouldShowNewConversationButton(state)).toBe(true);

    state.isSettingsPageOpen = true;
    expect(shouldShowNewConversationButton(state)).toBe(true);

    state.isPreparingNewConversation = true;
    expect(shouldShowNewConversationButton(state)).toBe(true);
  });

  test('keeps conversation controls available during background orchestration', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });

    expect(shouldDisableConversationControls(state)).toBe(false);

    setOrchestrationRunning(state, true);
    expect(shouldDisableConversationControls(state)).toBe(false);

    setLoadingModel(state, true);
    expect(shouldDisableConversationControls(state)).toBe(true);

    setLoadingModel(state, false);
    setGenerating(state, true);
    expect(shouldDisableConversationControls(state)).toBe(true);
  });

  test('tracks engine, interaction, orchestration, and workspace phases through helpers', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });

    expect(deriveEnginePhase(state)).toBe(ENGINE_PHASES.IDLE);

    setLoadingModel(state, true);
    expect(state.enginePhase).toBe(ENGINE_PHASES.LOADING);

    setModelReady(state, true);
    setLoadingModel(state, false);
    expect(state.enginePhase).toBe(ENGINE_PHASES.READY);

    setGenerating(state, true);
    expect(state.enginePhase).toBe(ENGINE_PHASES.GENERATING);

    setGenerating(state, false);
    expect(state.enginePhase).toBe(ENGINE_PHASES.READY);

    setUserMessageEditState(state, { messageId: 'message-1' });
    expect(state.interactionMode).toBe(INTERACTION_MODES.MESSAGE_EDIT);

    setUserMessageEditState(state, { messageId: 'message-1', branchSourceMessageId: 'message-1' });
    expect(state.interactionMode).toBe(INTERACTION_MODES.MESSAGE_BRANCH);

    clearUserMessageEditState(state);
    setChatTitleEditing(state, true);
    expect(state.interactionMode).toBe(INTERACTION_MODES.TITLE_EDIT);

    setChatTitleEditing(state, false);
    setSwitchingVariant(state, true);
    expect(state.interactionMode).toBe(INTERACTION_MODES.VARIANT_SWITCH);

    setSwitchingVariant(state, false);
    setOrchestrationRunning(state, true);
    expect(state.orchestrationStatus).toBe(ORCHESTRATION_STATUSES.RUNNING);

    setOrchestrationRunning(state, false);
    expect(state.orchestrationStatus).toBe(ORCHESTRATION_STATUSES.IDLE);

    setSettingsPageOpen(state, true);
    expect(state.workspaceView).toBe(WORKSPACE_VIEWS.SETTINGS);

    setSettingsPageOpen(state, false);
    state.hasStartedChatWorkspace = true;
    setModelReady(state, false);
    refreshWorkspaceView(state);
    expect(state.workspaceView).toBe(WORKSPACE_VIEWS.PRECHAT);

    setModelReady(state, true);
    setPreparingNewConversation(state, true);
    expect(state.workspaceView).toBe(WORKSPACE_VIEWS.PRECHAT);
  });
});
