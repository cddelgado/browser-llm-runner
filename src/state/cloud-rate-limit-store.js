const CLOUD_RATE_LIMIT_DB_NAME = 'browser-llm-runner-cloud-rate-limit-db';
const CLOUD_RATE_LIMIT_DB_VERSION = 1;
const CLOUD_RATE_LIMIT_STORE_NAME = 'cloudRateLimits';
const inMemoryRateLimitRecords = new Map();

function openCloudRateLimitDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    const request = indexedDB.open(CLOUD_RATE_LIMIT_DB_NAME, CLOUD_RATE_LIMIT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CLOUD_RATE_LIMIT_STORE_NAME)) {
        db.createObjectStore(CLOUD_RATE_LIMIT_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open the cloud rate-limit IndexedDB database.'));
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

function withTransaction(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CLOUD_RATE_LIMIT_STORE_NAME, mode);
    const store = transaction.objectStore(CLOUD_RATE_LIMIT_STORE_NAME);

    Promise.resolve()
      .then(() => operation(store))
      .then(resolve)
      .catch(reject);

    transaction.onerror = () => {
      reject(transaction.error || new Error('Cloud rate-limit IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error('Cloud rate-limit IndexedDB transaction was aborted.'));
    };
  });
}

function normalizeTimestamps(value, cutoff) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > cutoff)
    .sort((left, right) => left - right);
}

function consumeRecord(record, rateLimit, now) {
  const windowStart = now - rateLimit.windowMs;
  const timestamps = normalizeTimestamps(record?.timestamps, windowStart);
  if (timestamps.length >= rateLimit.maxRequests) {
    return {
      allowed: false,
      nextRecord: { id: record?.id || '', timestamps },
      retryAfterMs: Math.max(0, timestamps[0] + rateLimit.windowMs - now),
      remainingRequests: 0,
    };
  }

  timestamps.push(now);
  return {
    allowed: true,
    nextRecord: {
      id: record?.id || '',
      timestamps,
      updatedAt: now,
    },
    retryAfterMs: 0,
    remainingRequests: Math.max(0, rateLimit.maxRequests - timestamps.length),
  };
}

function buildCloudRateLimitRecordId(providerId, remoteModelId) {
  const normalizedProviderId =
    typeof providerId === 'string' && providerId.trim() ? providerId.trim() : '';
  const normalizedRemoteModelId =
    typeof remoteModelId === 'string' && remoteModelId.trim() ? remoteModelId.trim() : '';
  return normalizedProviderId && normalizedRemoteModelId
    ? `${normalizedProviderId}:${encodeURIComponent(normalizedRemoteModelId)}`
    : '';
}

export async function consumeCloudModelRateLimit(providerId, remoteModelId, rateLimit, now = Date.now()) {
  const recordId = buildCloudRateLimitRecordId(providerId, remoteModelId);
  if (
    !recordId ||
    !rateLimit ||
    !Number.isInteger(rateLimit.maxRequests) ||
    rateLimit.maxRequests <= 0 ||
    !Number.isInteger(rateLimit.windowMs) ||
    rateLimit.windowMs <= 0
  ) {
    return {
      allowed: true,
      retryAfterMs: 0,
      remainingRequests: null,
    };
  }

  const db = await openCloudRateLimitDb();
  if (!db) {
    const result = consumeRecord(
      {
        id: recordId,
        timestamps: inMemoryRateLimitRecords.get(recordId) || [],
      },
      rateLimit,
      now
    );
    inMemoryRateLimitRecords.set(recordId, result.nextRecord.timestamps);
    return {
      allowed: result.allowed,
      retryAfterMs: result.retryAfterMs,
      remainingRequests: result.remainingRequests,
    };
  }

  try {
    return await withTransaction(db, 'readwrite', async (store) => {
      const existingRecord = await requestToPromise(
        store.get(recordId),
        'Failed to read the saved cloud rate-limit record.'
      );
      const result = consumeRecord(
        {
          id: recordId,
          timestamps: existingRecord?.timestamps,
        },
        rateLimit,
        now
      );
      store.put(result.nextRecord);
      return {
        allowed: result.allowed,
        retryAfterMs: result.retryAfterMs,
        remainingRequests: result.remainingRequests,
      };
    });
  } finally {
    db.close();
  }
}
