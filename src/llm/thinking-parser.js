function normalizeThinkingTags(thinkingTags) {
  if (!thinkingTags || typeof thinkingTags !== 'object') {
    return null;
  }
  const open = typeof thinkingTags.open === 'string' ? thinkingTags.open : '';
  const close = typeof thinkingTags.close === 'string' ? thinkingTags.close : '';
  const stripLeadingText =
    typeof thinkingTags.stripLeadingText === 'string' ? thinkingTags.stripLeadingText : '';
  if (!open || !close || open === close) {
    return null;
  }
  return { open, close, stripLeadingText };
}

function stripThinkingPrefix(text, stripLeadingText) {
  if (!stripLeadingText) {
    return text;
  }
  const escapedPrefix = stripLeadingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}(?:\\r?\\n)?`);
  return text.replace(pattern, '');
}

const RESPONSE_CONTROL_TOKEN_NAMES = [
  'bos',
  'eos',
  'pad',
  'turn',
  'eot',
  'eom',
  'eot_id',
  'eom_id',
  'start_of_turn',
  'end_of_turn',
];

const RESPONSE_CONTROL_TOKEN_PATTERN = new RegExp(
  `<\\|?(?:${RESPONSE_CONTROL_TOKEN_NAMES.join('|')})\\|?>`,
  'gi'
);

function stripTrailingResponseControlTokens(text) {
  return String(text || '').replace(
    new RegExp(`(?:\\s*${RESPONSE_CONTROL_TOKEN_PATTERN.source})+$`, 'gi'),
    ''
  );
}

export function parseThinkingText(rawText, thinkingTags) {
  const text = String(rawText || '');
  const normalizedThinkingTags = normalizeThinkingTags(thinkingTags);
  if (!normalizedThinkingTags) {
    return {
      response: text,
      thoughts: '',
      hasThinking: false,
      isThinkingComplete: false,
    };
  }

  const { open, close, stripLeadingText } = normalizedThinkingTags;
  let response = '';
  let thoughts = '';
  let cursor = 0;
  let hasThinking = false;
  let isThinkingComplete = false;

  while (cursor < text.length) {
    const openIndex = text.indexOf(open, cursor);
    if (openIndex < 0) {
      response += text.slice(cursor);
      break;
    }

    response += text.slice(cursor, openIndex);
    hasThinking = true;

    const contentStart = openIndex + open.length;
    const closeIndex = text.indexOf(close, contentStart);
    if (closeIndex < 0) {
      thoughts += stripThinkingPrefix(text.slice(contentStart), stripLeadingText);
      break;
    }

    thoughts += stripThinkingPrefix(text.slice(contentStart, closeIndex), stripLeadingText);
    isThinkingComplete = true;
    cursor = closeIndex + close.length;
  }

  return {
    response: stripTrailingResponseControlTokens(response),
    thoughts,
    hasThinking,
    isThinkingComplete,
  };
}
