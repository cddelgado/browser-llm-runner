import { normalizeSkillPackage, normalizeSkillPackages } from '../skills/skill-packages.js';

const SKILL_DB_NAME = 'browser-llm-runner-skills-db';
const SKILL_DB_VERSION = 1;
const SKILL_PACKAGE_STORE_NAME = 'skillPackages';

function openSkillDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(SKILL_DB_NAME, SKILL_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SKILL_PACKAGE_STORE_NAME)) {
        db.createObjectStore(SKILL_PACKAGE_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open the skills IndexedDB database.'));
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

function withTransaction(db, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);

    Promise.resolve()
      .then(() => operation(store, transaction))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('Skills IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('Skills IndexedDB transaction was aborted.'));
    };
  });
}

function createSkillPackageId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `skill-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadSkillPackages() {
  const db = await openSkillDb();
  if (!db) {
    return [];
  }
  try {
    const skillPackages = await withTransaction(
      db,
      SKILL_PACKAGE_STORE_NAME,
      'readonly',
      (store) =>
        requestToPromise(store.getAll(), 'Failed to read saved skill packages from IndexedDB.')
    );
    return normalizeSkillPackages(skillPackages);
  } finally {
    db.close();
  }
}

export async function saveSkillPackage(skillPackage) {
  const db = await openSkillDb();
  if (!db) {
    return null;
  }
  try {
    const normalizedSkillPackage = normalizeSkillPackage({
      ...skillPackage,
      id:
        typeof skillPackage?.id === 'string' && skillPackage.id.trim()
          ? skillPackage.id.trim()
          : createSkillPackageId(),
      importedAt:
        Number.isFinite(skillPackage?.importedAt) && skillPackage.importedAt > 0
          ? Number(skillPackage.importedAt)
          : Date.now(),
    });
    if (!normalizedSkillPackage) {
      throw new Error('Skill package data is invalid.');
    }
    await withTransaction(db, SKILL_PACKAGE_STORE_NAME, 'readwrite', (store) => {
      store.put(normalizedSkillPackage);
    });
    return normalizedSkillPackage;
  } finally {
    db.close();
  }
}

export async function removeSkillPackage(skillPackageId) {
  const normalizedId =
    typeof skillPackageId === 'string' && skillPackageId.trim() ? skillPackageId.trim() : '';
  if (!normalizedId) {
    return false;
  }
  const db = await openSkillDb();
  if (!db) {
    return false;
  }
  try {
    await withTransaction(db, SKILL_PACKAGE_STORE_NAME, 'readwrite', (store) => {
      store.delete(normalizedId);
    });
    return true;
  } finally {
    db.close();
  }
}
