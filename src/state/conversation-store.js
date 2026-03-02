const CONVERSATION_DB_NAME = 'browser-llm-runner-db';
const CONVERSATION_DB_VERSION = 1;
const CONVERSATION_STORE_NAME = 'appState';
const CONVERSATION_STATE_KEY = 'conversations.v1';
const CONVERSATION_SCHEMA_VERSION = 1;

function openConversationDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(CONVERSATION_DB_NAME, CONVERSATION_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONVERSATION_STORE_NAME)) {
        db.createObjectStore(CONVERSATION_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB.'));
    };
  });
}

function withStore(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CONVERSATION_STORE_NAME, mode);
    const store = transaction.objectStore(CONVERSATION_STORE_NAME);
    let operationResult;

    transaction.oncomplete = () => {
      resolve(operationResult);
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    };

    operation(store, (result) => {
      operationResult = result;
    });
  });
}

export async function loadConversationState() {
  const db = await openConversationDb();
  if (!db) {
    return null;
  }
  try {
    const record = await withStore(db, 'readonly', (store, setResult) => {
      const request = store.get(CONVERSATION_STATE_KEY);
      request.onsuccess = () => {
        setResult(request.result || null);
      };
      request.onerror = () => {
        throw request.error || new Error('Failed to read saved conversation state.');
      };
    });

    return record?.state || null;
  } finally {
    db.close();
  }
}

export async function saveConversationState(state) {
  const db = await openConversationDb();
  if (!db) {
    return false;
  }
  try {
    await withStore(db, 'readwrite', (store) => {
      store.put({
        key: CONVERSATION_STATE_KEY,
        schemaVersion: CONVERSATION_SCHEMA_VERSION,
        savedAt: Date.now(),
        state,
      });
    });
    return true;
  } finally {
    db.close();
  }
}
