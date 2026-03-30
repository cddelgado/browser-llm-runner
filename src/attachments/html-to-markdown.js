const SKIPPED_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);

function createHtmlDocument(html) {
  const markup = typeof html === 'string' ? html : '';
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(markup, 'text/html');
  }
  if (globalThis.document?.implementation?.createHTMLDocument) {
    const documentRef = globalThis.document.implementation.createHTMLDocument('');
    documentRef.documentElement.innerHTML = markup;
    return documentRef;
  }
  throw new Error('HTML parsing is unavailable in this environment.');
}

function normalizeTextNodeValue(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

function trimMarkdownBlock(block) {
  return String(block || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeInlineCode(text) {
  return String(text || '').replace(/`/g, '\\`');
}

function isBlockElement(node) {
  return node?.nodeType === 1 && BLOCK_TAGS.has(node.tagName.toLowerCase());
}

function collectInlineText(node) {
  if (!node) {
    return '';
  }
  if (node.nodeType === 3) {
    return normalizeTextNodeValue(node.nodeValue);
  }
  if (node.nodeType !== 1) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tagName)) {
    return '';
  }
  if (tagName === 'br') {
    return '\n';
  }
  if (tagName === 'hr') {
    return '\n---\n';
  }
  if (tagName === 'code' && node.parentElement?.tagName?.toLowerCase() !== 'pre') {
    const codeText = node.textContent?.replace(/\r\n?/g, '\n') || '';
    return codeText ? `\`${escapeInlineCode(codeText.trim())}\`` : '';
  }
  if (tagName === 'a') {
    const label = normalizeInlineMarkdown(renderInlineNodes(node.childNodes));
    const href = typeof node.getAttribute === 'function' ? node.getAttribute('href')?.trim() : '';
    if (href && label) {
      return `[${label}](${href})`;
    }
    return label || href || '';
  }
  if (tagName === 'img') {
    const alt = typeof node.getAttribute === 'function' ? node.getAttribute('alt')?.trim() : '';
    const src = typeof node.getAttribute === 'function' ? node.getAttribute('src')?.trim() : '';
    if (src) {
      return `![${alt || 'Image'}](${src})`;
    }
    return alt || '';
  }

  const content = renderInlineNodes(node.childNodes);
  if (!content) {
    return '';
  }
  if (tagName === 'strong' || tagName === 'b') {
    return `**${normalizeInlineMarkdown(content)}**`;
  }
  if (tagName === 'em' || tagName === 'i') {
    return `*${normalizeInlineMarkdown(content)}*`;
  }
  return content;
}

function renderInlineNodes(nodes) {
  return Array.from(nodes || [])
    .map((node) => collectInlineText(node))
    .join('');
}

function normalizeInlineMarkdown(text) {
  return String(text || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function prefixLines(text, prefix) {
  return String(text || '')
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function renderList(listNode, depth = 0) {
  const tagName = listNode?.tagName?.toLowerCase();
  const items = Array.from(listNode?.children || []).filter(
    (child) => child?.tagName?.toLowerCase() === 'li'
  );
  const ordered = tagName === 'ol';
  const renderedItems = items
    .map((item, index) => renderListItem(item, { ordered, index, depth }))
    .filter(Boolean);
  return trimMarkdownBlock(renderedItems.join('\n'));
}

function renderListItem(itemNode, { ordered, index, depth }) {
  const marker = ordered ? `${index + 1}. ` : '- ';
  const indent = '  '.repeat(Math.max(depth, 0));
  const childBlocks = [];
  let inlineBuffer = '';

  Array.from(itemNode.childNodes || []).forEach((child) => {
    if (isBlockElement(child) && child.tagName.toLowerCase() !== 'li') {
      const renderedChild = renderBlockNode(child, depth + 1);
      if (renderedChild) {
        childBlocks.push(renderedChild);
      }
      return;
    }
    inlineBuffer += collectInlineText(child);
  });

  const parts = [];
  const inlineText = normalizeInlineMarkdown(inlineBuffer);
  if (inlineText) {
    parts.push(`${indent}${marker}${inlineText}`);
  }
  childBlocks.forEach((block) => {
    const blockIndent = `${indent}  `;
    parts.push(prefixLines(block, blockIndent));
  });
  return parts.join('\n');
}

function renderTable(tableNode) {
  const rows = Array.from(tableNode?.querySelectorAll('tr') || [])
    .map((row) =>
      Array.from(row.children || [])
        .filter((cell) => {
          const tagName = cell?.tagName?.toLowerCase();
          return tagName === 'th' || tagName === 'td';
        })
        .map((cell) => normalizeInlineMarkdown(renderInlineNodes(cell.childNodes)))
    )
    .filter((cells) => cells.length);

  if (!rows.length) {
    return '';
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalizedRows = rows.map((row) => {
    const paddedRow = [...row];
    while (paddedRow.length < columnCount) {
      paddedRow.push('');
    }
    return paddedRow;
  });
  const firstRow = normalizedRows[0];
  const bodyRows = normalizedRows.slice(1);
  const separator = new Array(columnCount).fill('---');
  const markdownRows = [firstRow, separator, ...bodyRows].map((row) => `| ${row.join(' | ')} |`);
  return markdownRows.join('\n');
}

function renderBlockNode(node, depth = 0) {
  if (!node) {
    return '';
  }
  if (node.nodeType === 3) {
    return normalizeInlineMarkdown(node.nodeValue);
  }
  if (node.nodeType !== 1) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tagName)) {
    return '';
  }
  if (tagName === 'ul' || tagName === 'ol') {
    return renderList(node, depth);
  }
  if (tagName === 'pre') {
    const codeText = String(node.textContent || '')
      .replace(/\r\n?/g, '\n')
      .trimEnd();
    return codeText ? `\`\`\`\n${codeText}\n\`\`\`` : '';
  }
  if (tagName === 'blockquote') {
    const content = trimMarkdownBlock(renderBlockCollection(node.childNodes, depth + 1));
    return content ? prefixLines(content, '> ') : '';
  }
  if (tagName === 'table') {
    return renderTable(node);
  }
  if (tagName === 'hr') {
    return '---';
  }
  if (/^h[1-6]$/.test(tagName)) {
    const level = Number.parseInt(tagName.slice(1), 10);
    const text = normalizeInlineMarkdown(renderInlineNodes(node.childNodes));
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }
  if (tagName === 'br') {
    return '';
  }

  const hasBlockChildren = Array.from(node.childNodes || []).some((child) => isBlockElement(child));
  if (hasBlockChildren) {
    return renderBlockCollection(node.childNodes, depth);
  }
  return normalizeInlineMarkdown(renderInlineNodes(node.childNodes));
}

function renderBlockCollection(nodes, depth = 0) {
  return Array.from(nodes || [])
    .map((node) => renderBlockNode(node, depth))
    .map((block) => trimMarkdownBlock(block))
    .filter(Boolean)
    .join('\n\n');
}

export function convertHtmlToMarkdown(html) {
  const documentRef = createHtmlDocument(html);
  const root = documentRef.body || documentRef.documentElement;
  const markdown = trimMarkdownBlock(renderBlockCollection(root?.childNodes || []));
  return {
    markdown,
    warnings: [],
  };
}
