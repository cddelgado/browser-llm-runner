export function renderConversationListView({
  container,
  conversations,
  activeConversationId,
  getConversationMenuState,
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

    const menuState =
      typeof getConversationMenuState === 'function'
        ? getConversationMenuState(conversation)
        : {
            canEditName: false,
            canEditPrompt: false,
            canDownload: false,
            controlsDisabled: false,
          };

    const menuWrap = documentRef.createElement('div');
    menuWrap.className = 'conversation-actions';

    const menuToggle = documentRef.createElement('button');
    menuToggle.type = 'button';
    menuToggle.className = 'btn btn-sm conversation-menu-toggle';
    menuToggle.setAttribute('aria-label', `Conversation options for ${conversation.name}`);
    menuToggle.setAttribute('aria-haspopup', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('data-bs-toggle', 'tooltip');
    menuToggle.setAttribute('data-bs-title', 'Conversation options');
    setIconButtonContent(menuToggle, 'bi-three-dots-vertical', 'Conversation options');

    const menu = documentRef.createElement('div');
    menu.className = 'conversation-menu d-none';

    const editNameButton = documentRef.createElement('button');
    editNameButton.type = 'button';
    editNameButton.className = 'conversation-menu-item conversation-edit-name';
    editNameButton.textContent = 'Edit name';
    editNameButton.disabled = !menuState.canEditName || menuState.controlsDisabled;

    const editPromptButton = documentRef.createElement('button');
    editPromptButton.type = 'button';
    editPromptButton.className = 'conversation-menu-item conversation-edit-prompt';
    editPromptButton.textContent = 'Edit prompt';
    editPromptButton.disabled = !menuState.canEditPrompt || menuState.controlsDisabled;

    const downloadGroup = documentRef.createElement('div');
    downloadGroup.className = 'conversation-submenu-wrap';

    const downloadToggle = documentRef.createElement('button');
    downloadToggle.type = 'button';
    downloadToggle.className = 'conversation-menu-item conversation-download-toggle';
    downloadToggle.textContent = 'Download';
    downloadToggle.setAttribute('aria-haspopup', 'true');
    downloadToggle.setAttribute('aria-expanded', 'false');
    downloadToggle.disabled = !menuState.canDownload || menuState.controlsDisabled;

    const downloadMenu = documentRef.createElement('div');
    downloadMenu.className = 'conversation-submenu d-none';

    const downloadJsonButton = documentRef.createElement('button');
    downloadJsonButton.type = 'button';
    downloadJsonButton.className = 'conversation-submenu-item conversation-download-json';
    downloadJsonButton.textContent = 'JSON';
    downloadJsonButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+J');
    downloadJsonButton.disabled = !menuState.canDownload || menuState.controlsDisabled;

    const downloadMarkdownButton = documentRef.createElement('button');
    downloadMarkdownButton.type = 'button';
    downloadMarkdownButton.className = 'conversation-submenu-item conversation-download-markdown';
    downloadMarkdownButton.textContent = 'Markdown';
    downloadMarkdownButton.setAttribute('aria-keyshortcuts', 'Alt+Shift+M');
    downloadMarkdownButton.disabled = !menuState.canDownload || menuState.controlsDisabled;

    const deleteButton = documentRef.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'conversation-menu-item conversation-delete';
    deleteButton.textContent = 'Delete';
    deleteButton.disabled = menuState.controlsDisabled;

    downloadMenu.append(downloadJsonButton, downloadMarkdownButton);
    downloadGroup.append(downloadToggle, downloadMenu);
    menu.append(editNameButton, editPromptButton, downloadGroup, deleteButton);
    menuWrap.append(menuToggle, menu);

    item.append(selectButton, menuWrap);
    container.appendChild(item);
  });
}
