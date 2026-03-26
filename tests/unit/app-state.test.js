import { describe, expect, test } from 'vitest';
import {
  createAppState,
  findConversationById,
  getActiveConversation,
  getCurrentViewRoute,
  hasSelectedConversationWithHistory,
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
    expect(shouldDisableComposerForPreChatConversationSelection(state)).toBe(true);

    state.isSettingsPageOpen = true;
    expect(
      getCurrentViewRoute(state, {
        routeHome: 'home',
        routeChat: 'chat',
        routeSettings: 'settings',
      }),
    ).toBe('settings');
  });

  test('shows new conversation only after inference has started in the chat workspace', () => {
    const state = createAppState({
      activeGenerationConfig: {},
    });
    state.hasStartedChatWorkspace = true;

    expect(shouldShowNewConversationButton(state)).toBe(false);

    state.modelReady = true;
    expect(shouldShowNewConversationButton(state)).toBe(false);

    state.isGenerating = true;
    expect(shouldShowNewConversationButton(state)).toBe(true);

    state.isGenerating = false;
    state.conversations.push({
      id: 'conversation-1',
      activeLeafMessageId: 'message-2',
      messageNodes: [
        { id: 'message-1', role: 'user', parentId: null },
        { id: 'message-2', role: 'model', parentId: 'message-1' },
      ],
    });
    expect(shouldShowNewConversationButton(state)).toBe(true);

    state.modelReady = false;
    expect(shouldShowNewConversationButton(state)).toBe(false);
  });
});
