import {
  normalizeCloudProviderConfig,
  normalizeCloudProviderConfigs,
} from '../cloud/cloud-provider-config.js';

const CLOUD_PROVIDER_DB_NAME = 'browser-llm-runner-cloud-db';
const CLOUD_PROVIDER_DB_VERSION = 1;
const CLOUD_PROVIDER_STORE_NAME = 'cloudProviders';
const CLOUD_PROVIDER_SECRET_STORE_NAME = 'cloudProviderSecrets';
const CLOUD_PROVIDER_KEY_STORE_NAME = 'cloudProviderKeys';
const CLOUD_PROVIDER_KEY_ID = 'cloud-provider-secret-key-v1';

function openCloudProviderDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(CLOUD_PROVIDER_DB_NAME, CLOUD_PROVIDER_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLOUD_PROVIDER_STORE_NAME)) {
        db.createObjectStore(CLOUD_PROVIDER_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CLOUD_PROVIDER_SECRET_STORE_NAME)) {
        db.createObjectStore(CLOUD_PROVIDER_SECRET_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CLOUD_PROVIDER_KEY_STORE_NAME)) {
        db.createObjectStore(CLOUD_PROVIDER_KEY_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open the cloud provider IndexedDB database.'));
    };
  });
}

function requestToPromise(request, errorMessage) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error || new Error(errorMessage));
    };
  });
}

function withTransaction(db, storeNames, mode, operation) {
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const transaction = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((name) => [name, transaction.objectStore(name)]));

    Promise.resolve()
      .then(() => operation(stores, transaction))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('Cloud provider IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('Cloud provider IndexedDB transaction was aborted.'));
    };
  });
}

function createCloudProviderId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `cloud-provider-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isCryptoKey(value) {
  return typeof globalThis.CryptoKey === 'function' && value instanceof globalThis.CryptoKey;
}

function requireSubtleCrypto() {
  if (typeof globalThis.crypto?.subtle?.encrypt !== 'function') {
    throw new Error('Encrypted cloud-provider storage is unavailable in this browser.');
  }
  return globalThis.crypto.subtle;
}

function requireTextEncoder() {
  if (typeof globalThis.TextEncoder !== 'function' || typeof globalThis.TextDecoder !== 'function') {
    throw new Error('Encrypted cloud-provider storage is unavailable in this browser.');
  }
  return {
    encoder: new globalThis.TextEncoder(),
    decoder: new globalThis.TextDecoder(),
  };
}

async function ensureSecretKey(db) {
  return withTransaction(db, CLOUD_PROVIDER_KEY_STORE_NAME, 'readwrite', async (stores) => {
    const existingRecord = await requestToPromise(
      stores[CLOUD_PROVIDER_KEY_STORE_NAME].get(CLOUD_PROVIDER_KEY_ID),
      'Failed to read the cloud-provider encryption key.'
    );
    if (isCryptoKey(existingRecord?.key)) {
      return existingRecord.key;
    }

    const subtle = requireSubtleCrypto();
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    stores[CLOUD_PROVIDER_KEY_STORE_NAME].put({
      id: CLOUD_PROVIDER_KEY_ID,
      key,
      createdAt: Date.now(),
    });
    return key;
  });
}

async function readSecretKey(db) {
  return withTransaction(db, CLOUD_PROVIDER_KEY_STORE_NAME, 'readonly', async (stores) => {
    const record = await requestToPromise(
      stores[CLOUD_PROVIDER_KEY_STORE_NAME].get(CLOUD_PROVIDER_KEY_ID),
      'Failed to read the cloud-provider encryption key.'
    );
    if (isCryptoKey(record?.key)) {
      return record.key;
    }
    throw new Error('No encrypted cloud-provider key was found in this browser.');
  });
}

async function encryptSecret(secret, key) {
  const subtle = requireSubtleCrypto();
  const { encoder } = requireTextEncoder();
  const normalizedSecret = typeof secret === 'string' ? secret.trim() : '';
  if (!normalizedSecret) {
    throw new Error('Cloud-provider secrets cannot be empty.');
  }
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encoder.encode(normalizedSecret)
  );
  return {
    iv,
    ciphertext: new Uint8Array(encrypted),
  };
}

async function decryptSecret(record, key) {
  if (!record?.iv || !record?.ciphertext) {
    throw new Error('The stored cloud-provider secret is unavailable.');
  }
  const subtle = requireSubtleCrypto();
  const { decoder } = requireTextEncoder();
  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: record.iv instanceof Uint8Array ? record.iv : new Uint8Array(record.iv),
    },
    key,
    record.ciphertext instanceof Uint8Array ? record.ciphertext : new Uint8Array(record.ciphertext)
  );
  return decoder.decode(decrypted).trim();
}

export async function loadCloudProviders() {
  const db = await openCloudProviderDb();
  if (!db) {
    return [];
  }
  try {
    const providers = await withTransaction(
      db,
      CLOUD_PROVIDER_STORE_NAME,
      'readonly',
      (stores) =>
        requestToPromise(
          stores[CLOUD_PROVIDER_STORE_NAME].getAll(),
          'Failed to read saved cloud providers from IndexedDB.'
        )
    );
    return normalizeCloudProviderConfigs(providers);
  } finally {
    db.close();
  }
}

export async function saveCloudProvider(provider, { apiKey = '' } = {}) {
  const db = await openCloudProviderDb();
  if (!db) {
    throw new Error('Secure cloud-provider storage is unavailable in this browser session.');
  }
  try {
    const normalizedProvider = normalizeCloudProviderConfig({
      ...provider,
      id:
        typeof provider?.id === 'string' && provider.id.trim()
          ? provider.id.trim()
          : createCloudProviderId(),
      importedAt:
        Number.isFinite(provider?.importedAt) && provider.importedAt > 0
          ? Number(provider.importedAt)
          : Date.now(),
      updatedAt: Date.now(),
    });
    if (!normalizedProvider) {
      throw new Error('Cloud provider data is invalid.');
    }

    const key = await ensureSecretKey(db);
    const encryptedSecret = await encryptSecret(apiKey, key);

    await withTransaction(
      db,
      [CLOUD_PROVIDER_STORE_NAME, CLOUD_PROVIDER_SECRET_STORE_NAME],
      'readwrite',
      (stores) => {
        stores[CLOUD_PROVIDER_STORE_NAME].put(normalizedProvider);
        stores[CLOUD_PROVIDER_SECRET_STORE_NAME].put({
          id: normalizedProvider.id,
          updatedAt: Date.now(),
          iv: encryptedSecret.iv,
          ciphertext: encryptedSecret.ciphertext,
        });
      }
    );

    return normalizedProvider;
  } finally {
    db.close();
  }
}

export async function updateCloudProvider(provider) {
  const db = await openCloudProviderDb();
  if (!db) {
    throw new Error('Secure cloud-provider storage is unavailable in this browser session.');
  }
  try {
    const normalizedProvider = normalizeCloudProviderConfig({
      ...provider,
      updatedAt: Date.now(),
    });
    if (!normalizedProvider) {
      throw new Error('Cloud provider data is invalid.');
    }
    await withTransaction(db, CLOUD_PROVIDER_STORE_NAME, 'readwrite', (stores) => {
      stores[CLOUD_PROVIDER_STORE_NAME].put(normalizedProvider);
    });
    return normalizedProvider;
  } finally {
    db.close();
  }
}

export async function getCloudProviderSecret(providerId) {
  const normalizedProviderId =
    typeof providerId === 'string' && providerId.trim() ? providerId.trim() : '';
  if (!normalizedProviderId) {
    throw new Error('A cloud provider id is required to load the saved API key.');
  }

  const db = await openCloudProviderDb();
  if (!db) {
    throw new Error('Secure cloud-provider storage is unavailable in this browser session.');
  }
  try {
    const [key, secretRecord] = await Promise.all([
      readSecretKey(db),
      withTransaction(db, CLOUD_PROVIDER_SECRET_STORE_NAME, 'readonly', (stores) =>
        requestToPromise(
          stores[CLOUD_PROVIDER_SECRET_STORE_NAME].get(normalizedProviderId),
          'Failed to read the saved cloud-provider secret.'
        )
      ),
    ]);
    if (!secretRecord) {
      throw new Error('No saved API key was found for that cloud provider.');
    }
    return decryptSecret(secretRecord, key);
  } finally {
    db.close();
  }
}

export async function removeCloudProvider(providerId) {
  const normalizedProviderId =
    typeof providerId === 'string' && providerId.trim() ? providerId.trim() : '';
  if (!normalizedProviderId) {
    return false;
  }
  const db = await openCloudProviderDb();
  if (!db) {
    return false;
  }
  try {
    await withTransaction(
      db,
      [CLOUD_PROVIDER_STORE_NAME, CLOUD_PROVIDER_SECRET_STORE_NAME],
      'readwrite',
      (stores) => {
        stores[CLOUD_PROVIDER_STORE_NAME].delete(normalizedProviderId);
        stores[CLOUD_PROVIDER_SECRET_STORE_NAME].delete(normalizedProviderId);
      }
    );
    return true;
  } finally {
    db.close();
  }
}
