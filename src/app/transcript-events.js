export function bindTranscriptEvents({
  chatTranscript,
  chatMain,
  jumpToTopButton,
  jumpToPreviousUserButton,
  jumpToNextModelButton,
  jumpToLatestButton,
  chatTranscriptStart,
  chatTranscriptEnd,
  messageInput,
  switchModelVariant,
  regenerateFromMessage,
  fixResponseFromMessage,
  switchUserVariant,
  beginUserMessageEdit,
  saveUserMessageEdit,
  cancelUserMessageEdit,
  branchFromUserMessage,
  handleMessageCopyAction,
  updateTranscriptNavigationButtonVisibility,
  focusTranscriptBoundary,
  stepTranscriptNavigation,
}) {
  if (chatTranscript) {
    chatTranscript.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const prevVariantButton = target.closest('.response-variant-prev');
      if (prevVariantButton instanceof HTMLButtonElement) {
        switchModelVariant(prevVariantButton.dataset.messageId || '', -1);
        return;
      }
      const nextVariantButton = target.closest('.response-variant-next');
      if (nextVariantButton instanceof HTMLButtonElement) {
        switchModelVariant(nextVariantButton.dataset.messageId || '', 1);
        return;
      }
      const regenerateButton = target.closest('.regenerate-response-btn');
      if (regenerateButton instanceof HTMLButtonElement) {
        regenerateFromMessage(regenerateButton.dataset.messageId || '');
        return;
      }
      const fixButton = target.closest('.fix-response-btn');
      if (fixButton instanceof HTMLButtonElement) {
        await fixResponseFromMessage(fixButton.dataset.messageId || '');
        return;
      }
      const userVariantPrevButton = target.closest('.user-variant-prev');
      if (userVariantPrevButton instanceof HTMLButtonElement) {
        switchUserVariant(userVariantPrevButton.dataset.messageId || '', -1);
        return;
      }
      const userVariantNextButton = target.closest('.user-variant-next');
      if (userVariantNextButton instanceof HTMLButtonElement) {
        switchUserVariant(userVariantNextButton.dataset.messageId || '', 1);
        return;
      }
      const editUserButton = target.closest('.edit-user-message-btn');
      if (editUserButton instanceof HTMLButtonElement) {
        beginUserMessageEdit(editUserButton.dataset.messageId || '');
        return;
      }
      const saveUserButton = target.closest('.save-user-message-btn');
      if (saveUserButton instanceof HTMLButtonElement) {
        saveUserMessageEdit(saveUserButton.dataset.messageId || '');
        return;
      }
      const cancelUserEditButton = target.closest('.cancel-user-edit-btn');
      if (cancelUserEditButton instanceof HTMLButtonElement) {
        cancelUserMessageEdit(cancelUserEditButton.dataset.messageId || '');
        return;
      }
      const branchUserButton = target.closest('.branch-user-message-btn');
      if (branchUserButton instanceof HTMLButtonElement) {
        branchFromUserMessage(branchUserButton.dataset.messageId || '');
        return;
      }
      const copyButton = target.closest('.copy-message-btn, .thoughts-copy-btn, .copy-mathml-btn');
      if (copyButton instanceof HTMLButtonElement) {
        await handleMessageCopyAction(
          copyButton.dataset.messageId || '',
          copyButton.dataset.copyType || 'message'
        );
      }
    });
  }

  if (chatMain) {
    chatMain.addEventListener('scroll', () => {
      updateTranscriptNavigationButtonVisibility();
    });
  }

  if (jumpToTopButton instanceof HTMLButtonElement) {
    jumpToTopButton.addEventListener('click', () => {
      if (jumpToTopButton.getAttribute('aria-disabled') === 'true') {
        return;
      }
      focusTranscriptBoundary(chatTranscriptStart, { align: 'start' });
    });
  }

  if (jumpToPreviousUserButton instanceof HTMLButtonElement) {
    jumpToPreviousUserButton.addEventListener('click', () => {
      if (jumpToPreviousUserButton.getAttribute('aria-disabled') === 'true') {
        return;
      }
      stepTranscriptNavigation('user', -1);
      updateTranscriptNavigationButtonVisibility();
    });
  }

  if (jumpToNextModelButton instanceof HTMLButtonElement) {
    jumpToNextModelButton.addEventListener('click', () => {
      if (jumpToNextModelButton.getAttribute('aria-disabled') === 'true') {
        return;
      }
      stepTranscriptNavigation('model', 1);
      updateTranscriptNavigationButtonVisibility();
    });
  }

  if (jumpToLatestButton instanceof HTMLButtonElement) {
    jumpToLatestButton.addEventListener('click', () => {
      if (jumpToLatestButton.getAttribute('aria-disabled') === 'true') {
        return;
      }
      const restoreComposerFocus = document.activeElement === jumpToLatestButton;
      focusTranscriptBoundary(chatTranscriptEnd, { align: 'end' });
      if (restoreComposerFocus && messageInput instanceof HTMLTextAreaElement) {
        messageInput.focus();
      }
    });
  }
}
