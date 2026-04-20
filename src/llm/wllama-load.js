function toMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || '');
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

export function shouldRetryWllamaModelLoad(error) {
  return /\binvalid magic number\b/i.test(toMessage(error)) || /\bnot a gguf\b/i.test(toMessage(error));
}

export function normalizeWllamaThreadCount(value) {
  return normalizePositiveInteger(value);
}

export function expandWllamaModelUrls(modelUrl) {
  const normalizedModelUrl = typeof modelUrl === 'string' ? modelUrl.trim() : '';
  if (!normalizedModelUrl) {
    return [];
  }
  const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
  const queryMatch = normalizedModelUrl.match(/\.gguf(\?.*)?$/);
  const queryParams = queryMatch?.[1] ?? '';
  const matches = normalizedModelUrl.match(urlPartsRegex);
  if (!matches) {
    return [normalizedModelUrl];
  }
  const baseUrl = normalizedModelUrl.replace(urlPartsRegex, '');
  const total = Number(matches[2]);
  if (!Number.isInteger(total) || total <= 0) {
    return [normalizedModelUrl];
  }
  return Array.from({ length: total }, (_, index) => {
    const current = String(index + 1).padStart(5, '0');
    return `${baseUrl}-${current}-of-${matches[2]}.gguf${queryParams}`;
  });
}
