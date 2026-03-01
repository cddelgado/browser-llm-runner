import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './styles.css';

const THEME_STORAGE_KEY = 'ui-theme-preference';
const themeSelect = document.getElementById('themeSelect');
const conversationList = document.getElementById('conversationList');
const newConversationBtn = document.getElementById('newConversationBtn');
const chatForm = document.querySelector('.composer');
const messageInput = document.getElementById('messageInput');
const chatTranscript = document.getElementById('chatTranscript');
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

let conversationCount = conversationList ? conversationList.children.length : 0;

function getStoredThemePreference() {
  const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedPreference === 'light' || storedPreference === 'dark' || storedPreference === 'system') {
    return storedPreference;
  }
  return 'system';
}

function resolveTheme(preference) {
  if (preference === 'system') {
    return colorSchemeQuery.matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference) {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
  if (themeSelect) {
    themeSelect.value = preference;
  }
}

const themePreference = getStoredThemePreference();
applyTheme(themePreference);

if (themeSelect) {
  themeSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    if (value !== 'light' && value !== 'dark' && value !== 'system') {
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, value);
    applyTheme(value);
  });
}

colorSchemeQuery.addEventListener('change', () => {
  if (getStoredThemePreference() === 'system') {
    applyTheme('system');
  }
});

function setActiveConversation(item) {
  if (!conversationList) {
    return;
  }

  conversationList.querySelectorAll('.conversation-item').forEach((entry) => {
    entry.classList.remove('is-active');
    const button = entry.querySelector('.conversation-select');
    if (button) {
      button.removeAttribute('aria-current');
    }
  });

  item.classList.add('is-active');
  const activeButton = item.querySelector('.conversation-select');
  if (activeButton) {
    activeButton.setAttribute('aria-current', 'page');
  }
}

function createConversationItem(name) {
  const item = document.createElement('li');
  item.className = 'conversation-item';
  item.innerHTML = `
    <button type="button" class="conversation-select">${name}</button>
    <button
      type="button"
      class="btn btn-sm btn-link text-danger conversation-delete"
      aria-label="Delete ${name} conversation"
    >
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6.5 1h3l.5 1H13a.5.5 0 0 1 0 1h-.6l-.7 10.2A2 2 0 0 1 9.7 15H6.3a2 2 0 0 1-2-1.8L3.6 3H3a.5.5 0 0 1 0-1h3zM5 3l.7 10.1a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 3zM7 5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 7 5m2 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6A.5.5 0 0 1 9 5"></path>
      </svg>
    </button>
  `;
  return item;
}

if (newConversationBtn && conversationList) {
  newConversationBtn.addEventListener('click', () => {
    conversationCount += 1;
    const name = `New Conversation ${conversationCount}`;
    const newItem = createConversationItem(name);
    conversationList.prepend(newItem);
    setActiveConversation(newItem);
  });
}

if (conversationList) {
  conversationList.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const deleteButton = target.closest('.conversation-delete');
    if (deleteButton) {
      const item = deleteButton.closest('.conversation-item');
      if (!item) {
        return;
      }

      const wasActive = item.classList.contains('is-active');
      item.remove();

      if (wasActive && conversationList.firstElementChild) {
        setActiveConversation(conversationList.firstElementChild);
      }
      return;
    }

    const selectButton = target.closest('.conversation-select');
    if (selectButton) {
      const item = selectButton.closest('.conversation-item');
      if (item) {
        setActiveConversation(item);
      }
    }
  });
}

if (chatForm && messageInput && chatTranscript) {
  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = messageInput.value.trim();
    if (!value) {
      return;
    }

    const message = document.createElement('li');
    message.className = 'message-row user-message';
    message.innerHTML = `
      <p class="message-speaker">User</p>
      <p class="message-bubble"></p>
    `;
    message.querySelector('.message-bubble').textContent = value;
    chatTranscript.appendChild(message);
    messageInput.value = '';
    messageInput.focus();
  });
}
