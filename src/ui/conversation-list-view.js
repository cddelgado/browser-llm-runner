export function renderConversationListView({
  container,
  conversations,
  activeConversationId,
  setIconButtonContent,
}) {
  if (!container) {
    return;
  }
  const documentRef = container.ownerDocument;

  container.replaceChildren();

  conversations.forEach((conversation) => {
    const item = documentRef.createElement('li');
    item.className = `conversation-item${conversation.id === activeConversationId ? ' is-active' : ''}`;
    item.dataset.conversationId = conversation.id;

    const selectButton = documentRef.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'conversation-select';
    selectButton.textContent = conversation.name;
    if (conversation.id === activeConversationId) {
      selectButton.setAttribute('aria-current', 'page');
    }

    const deleteButton = documentRef.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-sm conversation-delete';
    deleteButton.setAttribute('aria-label', `Delete ${conversation.name} conversation`);
    deleteButton.setAttribute('data-bs-toggle', 'tooltip');
    deleteButton.setAttribute('data-bs-title', 'Delete conversation');
    setIconButtonContent(deleteButton, 'bi-trash-fill', 'Delete conversation');

    item.append(selectButton, deleteButton);
    container.appendChild(item);
  });
}
