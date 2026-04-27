import { deriveConversationMenuCapabilities } from '../state/conversation-model.js';

function isElementOfType(value, root, typeName) {
  const view = root?.ownerDocument?.defaultView || globalThis;
  const TypeCtor = view?.[typeName];
  return typeof TypeCtor === 'function' && value instanceof TypeCtor;
}

function escapeCssIdentifier(value) {
  if (typeof globalThis.CSS?.escape === 'function') {
    return globalThis.CSS.escape(value);
  }
  return String(value).replace(/[^A-Za-z0-9_-]/g, '\\$&');
}

function buildClassSelector(element) {
  if (!isElementOfType(element, element, 'HTMLElement')) {
    return '';
  }
  return Array.from(element.classList)
    .map((className) => `.${escapeCssIdentifier(className)}`)
    .join('');
}

export function findConversationMenuButton(conversationList, conversationId, selector) {
  if (!conversationList || !conversationId || !selector) {
    return null;
  }
  const item = Array.from(conversationList.querySelectorAll('.conversation-item')).find(
    (candidate) =>
      isElementOfType(candidate, conversationList, 'HTMLElement') &&
      candidate.dataset.conversationId === conversationId
  );
  return item?.querySelector(selector) || null;
}

/**
 * @param {{
 *   appState: any;
 *   conversationList?: HTMLElement | null;
 *   isUiBusy?: () => boolean;
 *   setActiveConversationById?: (conversationId: string) => void;
 *   deriveConversationMenuCapabilities?: (conversation: any) => any;
 * }} options
 */
export function createConversationMenuController({
  appState,
  conversationList = null,
  isUiBusy = () => false,
  setActiveConversationById = (_conversationId) => {},
  deriveConversationMenuCapabilities: deriveCapabilities = deriveConversationMenuCapabilities,
}) {
  function closeConversationMenus({ restoreFocusTo = null } = {}) {
    if (!isElementOfType(conversationList, conversationList, 'HTMLElement')) {
      return;
    }
    conversationList.querySelectorAll('.conversation-item.menu-open').forEach((item) => {
      item.classList.remove('menu-open');
    });
    conversationList.querySelectorAll('.conversation-menu').forEach((menu) => {
      menu.classList.add('d-none');
    });
    conversationList.querySelectorAll('.conversation-submenu').forEach((menu) => {
      menu.classList.add('d-none');
    });
    conversationList.querySelectorAll('.conversation-menu-toggle').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
    conversationList.querySelectorAll('.conversation-download-toggle').forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });
    if (isElementOfType(restoreFocusTo, conversationList, 'HTMLElement')) {
      restoreFocusTo.focus();
    }
  }

  function openConversationMenu(item, toggleButton) {
    if (
      !isElementOfType(item, conversationList, 'HTMLElement') ||
      !isElementOfType(toggleButton, conversationList, 'HTMLButtonElement')
    ) {
      return false;
    }
    const menu = item.querySelector('.conversation-menu');
    if (!isElementOfType(menu, conversationList, 'HTMLElement')) {
      return false;
    }
    const isOpen = item.classList.contains('menu-open');
    closeConversationMenus();
    if (isOpen) {
      return false;
    }
    item.classList.add('menu-open');
    menu.classList.remove('d-none');
    toggleButton.setAttribute('aria-expanded', 'true');
    return true;
  }

  function toggleConversationDownloadMenu(item, toggleButton) {
    if (
      !isElementOfType(item, conversationList, 'HTMLElement') ||
      !isElementOfType(toggleButton, conversationList, 'HTMLButtonElement')
    ) {
      return false;
    }
    const submenu = item.querySelector('.conversation-submenu');
    if (!isElementOfType(submenu, conversationList, 'HTMLElement')) {
      return false;
    }
    const isOpen = !submenu.classList.contains('d-none');
    submenu.classList.toggle('d-none', isOpen);
    toggleButton.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    return !isOpen;
  }

  function getConversationMenuState(conversation) {
    const capabilities = deriveCapabilities(conversation);
    return {
      ...capabilities,
      controlsDisabled: isUiBusy(),
    };
  }

  function runConversationMenuAction(
    conversationId,
    actionButton,
    callback = (_refreshedActionButton) => {}
  ) {
    if (!conversationId) {
      return false;
    }
    if (appState?.activeConversationId !== conversationId) {
      setActiveConversationById(conversationId);
    }
    closeConversationMenus();
    const refreshedActionButton = isElementOfType(actionButton, conversationList, 'HTMLElement')
      ? findConversationMenuButton(
          conversationList,
          conversationId,
          buildClassSelector(actionButton)
        )
      : null;
    callback(refreshedActionButton);
    return true;
  }

  return {
    closeConversationMenus,
    findConversationMenuButton: (conversationId, selector) =>
      findConversationMenuButton(conversationList, conversationId, selector),
    getConversationMenuState,
    openConversationMenu,
    runConversationMenuAction,
    toggleConversationDownloadMenu,
  };
}
