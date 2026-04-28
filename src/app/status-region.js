function isElementLike(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.nodeType === 1 &&
    value.classList &&
    typeof value.setAttribute === 'function'
  );
}

export function getStatusTone(message) {
  const normalized = String(message || '').trim();
  if (!normalized) {
    return { heading: 'Chat status', variant: 'secondary', role: 'status', live: 'polite' };
  }
  if (/error|failed|unable|cannot|no active|copy failed/i.test(normalized)) {
    return { heading: 'Chat error', variant: 'danger', role: 'status', live: 'polite' };
  }
  if (/loading|preparing|stopping|please wait|apply after current response/i.test(normalized)) {
    return { heading: 'Chat status', variant: 'warning', role: 'status', live: 'polite' };
  }
  if (
    /ready|saved|downloaded|copied|stopped|generated|updated|canceled|branch mode enabled/i.test(
      normalized
    )
  ) {
    return { heading: 'Chat status', variant: 'success', role: 'status', live: 'polite' };
  }
  return { heading: 'Chat status', variant: 'secondary', role: 'status', live: 'polite' };
}

export function applyStatusRegion(
  region,
  headingElement,
  messageElement,
  message,
  headingOverride = ''
) {
  if (!isElementLike(region) || !isElementLike(messageElement)) {
    return;
  }

  const normalizedMessage = String(message || '').trim();
  region.classList.toggle('d-none', !normalizedMessage);
  if (!normalizedMessage) {
    messageElement.textContent = '';
    return;
  }

  const tone = getStatusTone(normalizedMessage);
  region.classList.remove(
    'alert-secondary',
    'alert-success',
    'alert-warning',
    'alert-danger',
    'alert-info'
  );
  region.classList.add(`alert-${tone.variant}`);
  region.setAttribute('role', tone.role);
  region.setAttribute('aria-live', tone.live);
  if (isElementLike(headingElement)) {
    headingElement.textContent = headingOverride || tone.heading;
  }
  messageElement.textContent = normalizedMessage;
}
