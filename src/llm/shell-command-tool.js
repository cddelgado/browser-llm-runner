import { normalizeWorkspacePath, WORKSPACE_ROOT_PATH } from '../workspace/workspace-file-system.js';

const SHELL_FLAVOR = 'GNU/Linux-like shell subset';
const MAX_DIFF_MATRIX_CELLS = 1_000_000;
const DEFAULT_DIFF_CONTEXT_LINES = 3;
const MAX_SHELL_COMMAND_LENGTH = 2_000;
export const MAX_SHELL_TOOL_OUTPUT_LENGTH = 8_192;
const MAX_SHELL_TOKENS = 128;
const MAX_SHELL_VARIABLE_VALUE_LENGTH = 512;
const SHELL_LITERAL_DOLLAR_PLACEHOLDER = String.fromCharCode(0x1d);
const PIPELINE_SAFE_COMMAND_NAMES = new Set([
  'printf',
  'echo',
  'cat',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'cut',
  'tr',
  'nl',
  'grep',
  'sed',
]);
const FILE_EXTENSION_DESCRIPTIONS = Object.freeze({
  txt: 'text',
  md: 'Markdown text',
  markdown: 'Markdown text',
  csv: 'CSV text',
  html: 'HTML document',
  htm: 'HTML document',
  css: 'CSS stylesheet',
  js: 'JavaScript source',
  json: 'JSON text',
  xml: 'XML document',
  yml: 'YAML text',
  yaml: 'YAML text',
  pdf: 'PDF document',
  png: 'PNG image data',
  jpg: 'JPEG image data',
  jpeg: 'JPEG image data',
  gif: 'GIF image data',
});

const SHELL_COMMANDS = Object.freeze([
  {
    name: 'pwd',
    usage: 'pwd',
    description: 'Print the current working directory.',
  },
  {
    name: 'basename',
    usage: 'basename <path>',
    description: 'Print the final path component.',
  },
  {
    name: 'dirname',
    usage: 'dirname <path>',
    description: 'Print the parent directory path.',
  },
  {
    name: 'printf',
    usage: 'printf <format> [<argument>...]',
    description: 'Print formatted text without an automatic trailing newline.',
  },
  {
    name: 'true',
    usage: 'true',
    description: 'Exit successfully without output.',
  },
  {
    name: 'false',
    usage: 'false',
    description: 'Exit unsuccessfully without output.',
  },
  {
    name: 'cd',
    usage: 'cd [<directory>]',
    description: 'Change the current working directory.',
  },
  {
    name: 'ls',
    usage: 'ls [-1] [-R] [-d] [-h] [-l] [<path>...]',
    description: 'List files or directories under /workspace.',
  },
  {
    name: 'cat',
    usage: 'cat [-bns] [--number] [--number-nonblank] [--squeeze-blank] <file>...',
    description: 'Read a text file.',
  },
  {
    name: 'head',
    usage: 'head -n <count> <file>',
    description: 'Show the first lines of a text file.',
  },
  {
    name: 'tail',
    usage: 'tail -n <count> <file>',
    description: 'Show the last lines of a text file.',
  },
  {
    name: 'wc',
    usage: 'wc [-l|-w|-c] <file>',
    description: 'Count lines, words, or bytes in a text file.',
  },
  {
    name: 'sort',
    usage: 'sort [-r] [-n] <file>...',
    description: 'Sort lines from text files.',
  },
  {
    name: 'uniq',
    usage: 'uniq [-c] <file>',
    description: 'Filter or count adjacent duplicate lines from a text file.',
  },
  {
    name: 'cut',
    usage: 'cut -f <fields> [-d <delimiter>] <file>',
    description: 'Select delimited fields from each line of a text file.',
  },
  {
    name: 'paste',
    usage: 'paste [-d <delimiters>] <file>...',
    description: 'Merge lines from text files side by side.',
  },
  {
    name: 'join',
    usage: 'join [-1 <field>] [-2 <field>] [-t <delimiter>] <left-file> <right-file>',
    description: 'Join two text files on a selected field.',
  },
  {
    name: 'column',
    usage: 'column [-t] [-s <separator>] <file>',
    description: 'Align delimited or whitespace-separated text into columns.',
  },
  {
    name: 'tr',
    usage: 'tr [-d] <set1> [<set2>] <file>',
    description: 'Translate or delete characters from a text file.',
  },
  {
    name: 'nl',
    usage: 'nl <file>',
    description: 'Number the lines of a text file.',
  },
  {
    name: 'rmdir',
    usage: 'rmdir <directory>...',
    description: 'Remove empty directories under /workspace.',
  },
  {
    name: 'mkdir',
    usage: 'mkdir [-p] <directory>',
    description: 'Create directories under /workspace.',
  },
  {
    name: 'mktemp',
    usage: 'mktemp [-d] [<template>]',
    description: 'Create a unique temporary file or directory under /workspace.',
  },
  {
    name: 'touch',
    usage: 'touch <file>',
    description: 'Create an empty file when it does not exist.',
  },
  {
    name: 'cp',
    usage: 'cp <source> <destination>',
    description: 'Copy one file within /workspace.',
  },
  {
    name: 'mv',
    usage: 'mv <source> <destination>',
    description: 'Move or rename one file within /workspace.',
  },
  {
    name: 'rm',
    usage: 'rm [-r] [-f] <path>',
    description: 'Delete a file or directory within /workspace.',
  },
  {
    name: 'find',
    usage: 'find [<path>] [-name <pattern>] [-type f|d] [-maxdepth <n>] [-mindepth <n>]',
    description: 'Find files and directories under /workspace.',
  },
  {
    name: 'grep',
    usage: 'grep [-i] [-n] [-v] [-c] [-l] [-F] [-o] <pattern> <file>...',
    description: 'Search text files under /workspace.',
  },
  {
    name: 'sed',
    usage: "sed [-n] [-i] '<script>' <file>",
    description: 'Run a single sed-like print, delete, or substitute command on a text file.',
  },
  {
    name: 'file',
    usage: 'file <path>...',
    description: 'Describe a file or directory under /workspace.',
  },
  {
    name: 'diff',
    usage: 'diff [-u] <left-file> <right-file>',
    description: 'Compare two text files with unified-style emulated output.',
  },
  {
    name: 'curl',
    usage: 'curl [-I] [-X <method>] [-H "Header: value"]... [-d <body>] [-o <file>] <url>',
    description: 'Fetch a URL with the browser network stack and optional workspace output.',
  },
  {
    name: 'python',
    usage: 'python <script.py> [<argument>...] | python -c "<code>" [<argument>...]',
    description: 'Run browser-local Python against the workspace through the Pyodide runtime.',
  },
  {
    name: 'echo',
    usage: 'echo <text>',
    description: 'Print text to stdout.',
  },
  {
    name: 'set',
    usage: 'set <name> <value...>',
    description: 'Set a conversation-scoped shell variable.',
  },
  {
    name: 'unset',
    usage: 'unset <name>...',
    description: 'Unset one or more conversation-scoped shell variables.',
  },
  {
    name: 'which',
    usage: 'which <command>...',
    description: 'Report whether a command exists in this shell subset.',
  },
]);

function getTextEncoder() {
  return new globalThis.TextEncoder();
}

function getUtf8TextDecoder(options = {}) {
  return new globalThis.TextDecoder('utf-8', options);
}

function createShellResult(
  command,
  { exitCode = 0, stdout = '', stderr = '', currentWorkingDirectory = WORKSPACE_ROOT_PATH } = {}
) {
  return {
    shellFlavor: SHELL_FLAVOR,
    currentWorkingDirectory,
    command: typeof command === 'string' ? command : '',
    exitCode,
    stdout,
    stderr,
  };
}

function formatShellCommandUsageBody(currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  return [
    'Call again with {"cmd":"..."}',
    `Current working directory: ${currentWorkingDirectory}`,
    `Supported commands: ${SHELL_COMMANDS.map((command) => command.name).join(', ')}`,
  ].join('\n');
}

function getShellExecutionBody(result = {}) {
  const command = typeof result.command === 'string' ? result.command.trim() : '';
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const currentWorkingDirectory =
    typeof result.currentWorkingDirectory === 'string' && result.currentWorkingDirectory.trim()
      ? result.currentWorkingDirectory.trim()
      : WORKSPACE_ROOT_PATH;
  if (stderr) {
    return stderr;
  }
  if (stdout) {
    return stdout;
  }
  if (command === 'cd' || command.startsWith('cd ')) {
    return currentWorkingDirectory;
  }
  return '';
}

function buildShellOutputTruncationMessage(returnedLength, totalLength) {
  return `Output was truncated to ${returnedLength} of ${totalLength} characters. Retry with a command which returns targeted results.`;
}

function getShellPreviewText(text = '', maxLength = MAX_SHELL_TOOL_OUTPUT_LENGTH) {
  const normalizedText = typeof text === 'string' ? text : '';
  if (normalizedText.length <= maxLength) {
    return {
      text: normalizedText,
      truncated: false,
      returnedLength: normalizedText.length,
      totalLength: normalizedText.length,
    };
  }
  return {
    text: normalizedText.slice(0, maxLength),
    truncated: true,
    returnedLength: maxLength,
    totalLength: normalizedText.length,
  };
}

export function buildShellToolResponseEnvelope(
  result = {},
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  const hasCommand = typeof result?.command === 'string' && result.command.trim();
  if (!hasCommand) {
    return {
      status: 'success',
      body: formatShellCommandUsageBody(currentWorkingDirectory),
    };
  }
  const exitCode = Number.isFinite(result?.exitCode) ? Number(result.exitCode) : 1;
  const bodyInfo = getShellPreviewText(getShellExecutionBody(result));
  if (bodyInfo.truncated) {
    return {
      status: 'incomplete',
      body: bodyInfo.text,
      message: buildShellOutputTruncationMessage(bodyInfo.returnedLength, bodyInfo.totalLength),
    };
  }
  return {
    status: exitCode === 0 ? 'success' : 'failed',
    body: bodyInfo.text,
  };
}

function createShellError(
  command,
  commandName,
  message,
  exitCode = 1,
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  const prefix = typeof commandName === 'string' && commandName.trim() ? `${commandName}: ` : '';
  return createShellResult(command, {
    exitCode,
    stderr: `${prefix}${message}`,
    currentWorkingDirectory,
  });
}

function createRetryableShellError(
  command,
  commandName,
  message,
  retryMessage,
  exitCode = 1,
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  const normalizedRetryMessage =
    typeof retryMessage === 'string' && retryMessage.trim() ? retryMessage.trim() : '';
  return createShellError(
    command,
    commandName,
    normalizedRetryMessage ? `${message}\n${normalizedRetryMessage}` : message,
    exitCode,
    currentWorkingDirectory
  );
}

function toShellText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function countWords(text) {
  const normalized = toShellText(text).trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

function countLines(text) {
  const normalized = toShellText(text);
  if (!normalized) {
    return 0;
  }
  const matches = normalized.match(/\n/g);
  return (matches ? matches.length : 0) + (normalized.endsWith('\n') ? 0 : 1);
}

function basename(path) {
  const normalized = toShellText(path).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

function getFileExtension(path) {
  const name = basename(path).toLowerCase();
  const lastDotIndex = name.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === name.length - 1) {
    return '';
  }
  return name.slice(lastDotIndex + 1);
}

function dirname(path) {
  const normalized = toShellText(path).replace(/\\/g, '/');
  if (!normalized) {
    return '.';
  }
  const trimmed = normalized.replace(/\/+$/, '');
  if (!trimmed) {
    return '/';
  }
  const lastSlashIndex = trimmed.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return '.';
  }
  if (lastSlashIndex === 0) {
    return '/';
  }
  return trimmed.slice(0, lastSlashIndex);
}

function getMktempTemplatePath(template, currentWorkingDirectory) {
  const normalizedTemplate = String(template || '').trim();
  if (!normalizedTemplate) {
    return `${currentWorkingDirectory}/tmp.XXXXXX`;
  }
  return normalizedTemplate;
}

function fillMktempTemplate(templatePath) {
  const template = String(templatePath || '');
  const lastRun = template.match(/X+$/);
  if (!lastRun || lastRun[0].length < 3) {
    throw new Error("template must end with at least 3 consecutive 'X' characters.");
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const replacement = Array.from(
    { length: lastRun[0].length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');
  return `${template.slice(0, -lastRun[0].length)}${replacement}`;
}

function decodePrintfEscapes(text) {
  return String(text || '').replace(
    /\\([\\abfnrtv]|x[0-9A-Fa-f]{2}|0[0-7]{0,2}|.)/g,
    (match, escape) => {
      if (escape === 'a') {
        return '\x07';
      }
      if (escape === 'b') {
        return '\b';
      }
      if (escape === 'f') {
        return '\f';
      }
      if (escape === 'n') {
        return '\n';
      }
      if (escape === 'r') {
        return '\r';
      }
      if (escape === 't') {
        return '\t';
      }
      if (escape === 'v') {
        return '\v';
      }
      if (escape === '\\') {
        return '\\';
      }
      if (/^x[0-9A-Fa-f]{2}$/.test(escape)) {
        return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
      }
      if (/^0[0-7]{0,2}$/.test(escape)) {
        return String.fromCharCode(Number.parseInt(escape, 8));
      }
      return match.slice(1);
    }
  );
}

function formatPrintfDirective(specifier, value) {
  if (specifier === 's') {
    return String(value ?? '');
  }
  if (specifier === 'b') {
    return decodePrintfEscapes(String(value ?? ''));
  }
  if (specifier === 'd' || specifier === 'i') {
    const numericValue = Number.parseInt(String(value ?? ''), 10);
    return String(Number.isFinite(numericValue) ? numericValue : 0);
  }
  if (specifier === 'f') {
    const numericValue = Number(String(value ?? ''));
    return String(Number.isFinite(numericValue) ? numericValue : 0);
  }
  return null;
}

function formatPrintfOutput(format, values) {
  const decodedFormat = decodePrintfEscapes(String(format || ''));
  const argumentValues = Array.isArray(values) ? values : [];
  let nextArgumentIndex = 0;

  const getNextValue = () => {
    if (nextArgumentIndex >= argumentValues.length) {
      return '';
    }
    const value = argumentValues[nextArgumentIndex];
    nextArgumentIndex += 1;
    return value;
  };

  let cycleOutput = '';
  let expectedArgumentsPerCycle = 0;
  const formatter = decodedFormat.replace(/%(%|[sbdif])/g, (_match, specifier) => {
    if (specifier === '%') {
      return '%';
    }
    expectedArgumentsPerCycle += 1;
    return formatPrintfDirective(specifier, getNextValue());
  });

  if (/%(?!%|[sbdif])/.test(decodedFormat)) {
    const invalidSpecifier = decodedFormat.match(/%(?!%|[sbdif])(.)/);
    throw new Error(`unsupported conversion specification '%${invalidSpecifier?.[1] || ''}'.`);
  }

  cycleOutput += formatter;

  while (expectedArgumentsPerCycle > 0 && nextArgumentIndex < argumentValues.length) {
    let cycleArgumentCount = 0;
    cycleOutput += decodedFormat.replace(/%(%|[sbdif])/g, (_match, specifier) => {
      if (specifier === '%') {
        return '%';
      }
      cycleArgumentCount += 1;
      return formatPrintfDirective(specifier, getNextValue());
    });
    if (cycleArgumentCount === 0) {
      break;
    }
  }

  return cycleOutput;
}

function tokenizeShellCommand(command) {
  const text = toShellText(command).trim();
  const tokens = [];
  let current = '';
  let quote = '';
  let escaping = false;
  let escapingFromDoubleQuotes = false;

  for (const character of text) {
    if (escaping) {
      if (escapingFromDoubleQuotes && !['\\', '"', '$', '`'].includes(character)) {
        current += '\\';
      }
      current += character === '$' ? SHELL_LITERAL_DOLLAR_PLACEHOLDER : character;
      escaping = false;
      escapingFromDoubleQuotes = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaping = true;
      escapingFromDoubleQuotes = quote === '"';
      continue;
    }
    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      continue;
    }
    if (character === quote) {
      quote = '';
      continue;
    }
    if (quote === "'" && character === '$') {
      current += SHELL_LITERAL_DOLLAR_PLACEHOLDER;
      continue;
    }
    if (!quote && /\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += character;
  }

  if (escaping || quote) {
    throw new Error('unterminated escape or quote.');
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function splitShellPipelineSegments(command) {
  const text = toShellText(command);
  const segments = [];
  let current = '';
  let quote = '';
  let escaping = false;

  for (const character of text) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      current += character;
      escaping = true;
      continue;
    }
    if ((character === '"' || character === "'") && !quote) {
      current += character;
      quote = character;
      continue;
    }
    if (character === quote) {
      current += character;
      quote = '';
      continue;
    }
    if (!quote && character === '|') {
      const segment = current.trim();
      if (!segment) {
        throw new Error('pipeline segments cannot be empty.');
      }
      segments.push(segment);
      current = '';
      continue;
    }
    current += character;
  }

  if (escaping || quote) {
    throw new Error('unterminated escape or quote.');
  }

  const finalSegment = current.trim();
  if (!finalSegment) {
    throw new Error('pipeline segments cannot be empty.');
  }
  segments.push(finalSegment);
  return segments;
}

function hasUnsupportedShellSyntax(command, { allowPipes = false } = {}) {
  const text = toShellText(command);
  let quote = '';
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      return true;
    }
    if (character === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      continue;
    }
    if (character === quote) {
      quote = '';
      continue;
    }
    if (quote) {
      continue;
    }
    if (
      character === ';' ||
      character === '&' ||
      character === '`' ||
      character === '>' ||
      character === '<'
    ) {
      return true;
    }
    if (character === '|' && !allowPipes) {
      return true;
    }
    if (character === '$' && text[index + 1] === '(') {
      return true;
    }
  }

  return false;
}

function formatHumanReadableSize(size) {
  const normalizedSize = Number.isFinite(size) && size >= 0 ? size : 0;
  if (normalizedSize < 1024) {
    return `${normalizedSize}B`;
  }
  const units = ['K', 'M', 'G', 'T'];
  let value = normalizedSize;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const roundedValue = value >= 10 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${roundedValue}${units[unitIndex]}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCurlHeaderName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function isForbiddenBrowserRequestHeader(name) {
  const normalizedName = normalizeCurlHeaderName(name);
  return (
    normalizedName.startsWith('proxy-') ||
    normalizedName.startsWith('sec-') ||
    [
      'accept-charset',
      'accept-encoding',
      'access-control-request-headers',
      'access-control-request-method',
      'connection',
      'content-length',
      'cookie',
      'date',
      'dnt',
      'expect',
      'host',
      'keep-alive',
      'origin',
      'permissions-policy',
      'referer',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'via',
    ].includes(normalizedName)
  );
}

function getFetchRef(runtimeContext = {}) {
  return runtimeContext.fetchRef || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
}

function formatCurlStatusLine(response) {
  const status = Number.isFinite(response?.status) ? response.status : 0;
  const statusText =
    typeof response?.statusText === 'string' && response.statusText.trim()
      ? ` ${response.statusText.trim()}`
      : '';
  return `HTTP ${status}${statusText}`;
}

function formatCurlHeaderLines(headers) {
  if (!headers || typeof headers.forEach !== 'function') {
    return [];
  }
  const entries = [];
  headers.forEach((value, name) => {
    entries.push([String(name || '').toLowerCase(), String(value ?? '')]);
  });
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  return entries.map(([name, value]) => `${name}: ${value}`);
}

function parseCurlArguments(args) {
  const options = {
    includeHeadersOnly: false,
    method: '',
    headers: [],
    body: null,
    outputPath: '',
    url: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      continue;
    }
    if (argument === '-I') {
      options.includeHeadersOnly = true;
      continue;
    }
    if (argument === '-X') {
      index += 1;
      if (index >= args.length) {
        throw new Error('-X requires an HTTP method.');
      }
      options.method = String(args[index] || '')
        .trim()
        .toUpperCase();
      if (!options.method) {
        throw new Error('-X requires a non-empty HTTP method.');
      }
      continue;
    }
    if (argument === '-H') {
      index += 1;
      if (index >= args.length) {
        throw new Error('-H requires a header value.');
      }
      const headerText = String(args[index] || '');
      const separatorIndex = headerText.indexOf(':');
      if (separatorIndex <= 0) {
        throw new Error(`invalid header '${headerText}'; expected 'Name: value'.`);
      }
      const name = headerText.slice(0, separatorIndex).trim();
      const value = headerText.slice(separatorIndex + 1).trim();
      if (!name) {
        throw new Error(`invalid header '${headerText}'; expected 'Name: value'.`);
      }
      if (isForbiddenBrowserRequestHeader(name)) {
        throw new Error(`header '${name}' is not allowed by the browser fetch API.`);
      }
      options.headers.push([name, value]);
      continue;
    }
    if (argument === '-d') {
      index += 1;
      if (index >= args.length) {
        throw new Error('-d requires a request body.');
      }
      options.body = String(args[index] ?? '');
      continue;
    }
    if (argument === '-o') {
      index += 1;
      if (index >= args.length) {
        throw new Error('-o requires a destination file path.');
      }
      options.outputPath = String(args[index] || '').trim();
      if (!options.outputPath) {
        throw new Error('-o requires a destination file path.');
      }
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`unsupported option ${argument}.`);
    }
    if (options.url) {
      throw new Error('expected exactly one URL.');
    }
    options.url = String(argument || '').trim();
  }

  if (!options.url) {
    throw new Error('expected exactly one URL.');
  }

  return options;
}

function compileFindNamePattern(pattern) {
  const normalizedPattern = String(pattern || '');
  const expression = `^${normalizedPattern
    .split('*')
    .map((segment) => segment.split('?').map(escapeRegExp).join('.'))
    .join('.*')}$`;
  return new RegExp(expression);
}

function compileGrepPattern(pattern, { ignoreCase = false, fixedStrings = false } = {}) {
  const normalizedPattern = String(pattern || '');
  if (fixedStrings) {
    const normalizedNeedle = ignoreCase ? normalizedPattern.toLowerCase() : normalizedPattern;
    return {
      test: (line) =>
        ignoreCase
          ? String(line || '')
              .toLowerCase()
              .includes(normalizedPattern.toLowerCase())
          : String(line || '').includes(normalizedPattern),
      getMatches: (line) => {
        const haystack = String(line || '');
        const normalizedHaystack = ignoreCase ? haystack.toLowerCase() : haystack;
        if (!normalizedNeedle) {
          return normalizedHaystack.includes(normalizedNeedle) ? [''] : [];
        }
        const matches = [];
        let searchStart = 0;
        while (searchStart <= normalizedHaystack.length) {
          const matchIndex = normalizedHaystack.indexOf(normalizedNeedle, searchStart);
          if (matchIndex < 0) {
            break;
          }
          matches.push(haystack.slice(matchIndex, matchIndex + normalizedPattern.length));
          searchStart = matchIndex + Math.max(normalizedPattern.length, 1);
        }
        return matches;
      },
    };
  }
  const testExpression = new RegExp(normalizedPattern, ignoreCase ? 'i' : '');
  return {
    test: (line) => testExpression.test(String(line || '')),
    getMatches: (line) => {
      const haystack = String(line || '');
      const matchExpression = new RegExp(normalizedPattern, ignoreCase ? 'ig' : 'g');
      const matches = [];
      let match;
      while ((match = matchExpression.exec(haystack)) !== null) {
        matches.push(match[0]);
        if (match[0] === '') {
          matchExpression.lastIndex += 1;
        }
      }
      return matches;
    },
  };
}

function formatLsEntry(entry, { longFormat = false, humanReadable = false } = {}) {
  if (!longFormat) {
    return entry.name;
  }
  const typeMarker = entry.kind === 'directory' ? 'd' : '-';
  const size = Number.isFinite(entry.size) ? entry.size : 0;
  const formattedSize = humanReadable ? formatHumanReadableSize(size) : String(size);
  return `${typeMarker} ${formattedSize.padStart(8, ' ')} ${entry.name}`;
}

async function listDirectoryRecursively(
  workspaceFileSystem,
  directoryPath,
  options,
  seenDirectories = new Set()
) {
  const normalizedDirectoryPath = workspaceFileSystem.normalizePath(directoryPath);
  if (seenDirectories.has(normalizedDirectoryPath)) {
    return [];
  }
  seenDirectories.add(normalizedDirectoryPath);

  const entries = await workspaceFileSystem.listDirectory(normalizedDirectoryPath);
  const sections = [
    {
      path: normalizedDirectoryPath,
      lines: entries.map((entry) => formatLsEntry(entry, options)),
    },
  ];

  for (const entry of entries) {
    if (entry.kind !== 'directory') {
      continue;
    }
    sections.push(
      ...(await listDirectoryRecursively(workspaceFileSystem, entry.path, options, seenDirectories))
    );
  }

  return sections;
}

async function walkWorkspaceTree(workspaceFileSystem, rootPath, visit, depth = 0) {
  const stat = await workspaceFileSystem.stat(rootPath);
  await visit(stat, depth);
  if (stat.kind !== 'directory') {
    return;
  }
  const entries = await workspaceFileSystem.listDirectory(rootPath);
  for (const entry of entries) {
    await walkWorkspaceTree(workspaceFileSystem, entry.path, visit, depth + 1);
  }
}

async function safeStat(workspaceFileSystem, path) {
  try {
    return await workspaceFileSystem.stat(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (error?.name === 'NotFoundError' || /not found/i.test(message)) {
      return null;
    }
    throw error;
  }
}

function getCurrentWorkingDirectory(runtimeContext = {}) {
  const candidate =
    typeof runtimeContext?.conversation?.currentWorkingDirectory === 'string'
      ? runtimeContext.conversation.currentWorkingDirectory
      : WORKSPACE_ROOT_PATH;
  try {
    return normalizeWorkspacePath(candidate);
  } catch {
    return WORKSPACE_ROOT_PATH;
  }
}

function isValidShellVariableName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ''));
}

function isReadonlyShellVariable(name) {
  return name === 'PWD' || name === 'WORKSPACE';
}

function containsUnsupportedShellControlCharacters(value) {
  return Array.from(String(value || '')).some((character) => {
    const code = character.charCodeAt(0);
    return code !== 9 && (code < 32 || code === 127);
  });
}

function sanitizeShellVariableValue(value) {
  const normalizedValue = String(value ?? '');
  if (containsUnsupportedShellControlCharacters(normalizedValue)) {
    throw new Error('shell variable values cannot contain control characters.');
  }
  if (normalizedValue.length > MAX_SHELL_VARIABLE_VALUE_LENGTH) {
    throw new Error(
      `shell variable values must be ${MAX_SHELL_VARIABLE_VALUE_LENGTH} characters or fewer.`
    );
  }
  return normalizedValue;
}

function getShellVariables(runtimeContext = {}) {
  if (!runtimeContext?.conversation || typeof runtimeContext.conversation !== 'object') {
    return {};
  }
  const rawVariables =
    runtimeContext.conversation.shellVariables &&
    typeof runtimeContext.conversation.shellVariables === 'object' &&
    !Array.isArray(runtimeContext.conversation.shellVariables)
      ? runtimeContext.conversation.shellVariables
      : {};
  if (runtimeContext.conversation.shellVariables !== rawVariables) {
    runtimeContext.conversation.shellVariables = rawVariables;
  }
  return rawVariables;
}

function getShellVariableValue(
  name,
  runtimeContext = {},
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  if (name === 'PWD') {
    return currentWorkingDirectory;
  }
  if (name === 'WORKSPACE') {
    return WORKSPACE_ROOT_PATH;
  }
  const variables = getShellVariables(runtimeContext);
  if (typeof variables[name] !== 'string') {
    return '';
  }
  try {
    return sanitizeShellVariableValue(variables[name]);
  } catch {
    return '';
  }
}

function setShellVariable(runtimeContext = {}, name, value) {
  const variables = getShellVariables(runtimeContext);
  variables[name] = sanitizeShellVariableValue(value);
  return variables[name];
}

function unsetShellVariable(runtimeContext = {}, name) {
  const variables = getShellVariables(runtimeContext);
  delete variables[name];
}

function expandShellToken(
  token,
  runtimeContext = {},
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  return String(token || '')
    .replace(
      /\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})/g,
      (_match, shortName, bracedName) =>
        getShellVariableValue(shortName || bracedName, runtimeContext, currentWorkingDirectory)
    )
    .split(SHELL_LITERAL_DOLLAR_PLACEHOLDER)
    .join('$');
}

function expandShellTokens(
  tokens,
  runtimeContext = {},
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  return Array.isArray(tokens)
    ? tokens
        .map((token) => expandShellToken(token, runtimeContext, currentWorkingDirectory))
        .filter((token) => token !== '')
    : [];
}

function setCurrentWorkingDirectory(runtimeContext = {}, nextPath) {
  const normalizedPath = normalizeWorkspacePath(nextPath);
  if (runtimeContext?.conversation && typeof runtimeContext.conversation === 'object') {
    runtimeContext.conversation.currentWorkingDirectory = normalizedPath;
  }
  return normalizedPath;
}

function resolveWorkspacePath(
  workspaceFileSystem,
  rawPath,
  currentWorkingDirectory = WORKSPACE_ROOT_PATH
) {
  const rawValue = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!rawValue) {
    return workspaceFileSystem.normalizePath(currentWorkingDirectory);
  }
  const slashNormalized = rawValue.replace(/\\/g, '/');
  const isAbsolute =
    slashNormalized.startsWith('/') ||
    slashNormalized === 'workspace' ||
    slashNormalized.startsWith('workspace/');
  const seedPath = isAbsolute
    ? WORKSPACE_ROOT_PATH
    : workspaceFileSystem.normalizePath(currentWorkingDirectory);
  const seedSegments = seedPath.split('/').filter(Boolean);
  const candidateSegments = isAbsolute
    ? (slashNormalized.startsWith('/') ? slashNormalized : `/${slashNormalized}`)
        .split('/')
        .filter(Boolean)
    : slashNormalized.split('/').filter(Boolean);

  const normalizedSegments = isAbsolute ? [] : [...seedSegments];
  for (const segment of candidateSegments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (normalizedSegments.length <= 1) {
        throw new Error('Workspace paths must stay under /workspace.');
      }
      normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(segment);
  }
  return workspaceFileSystem.normalizePath(`/${normalizedSegments.join('/')}`);
}

async function resolveOutputPath(
  workspaceFileSystem,
  destinationPath,
  sourcePath,
  currentWorkingDirectory
) {
  const normalizedDestination = resolveWorkspacePath(
    workspaceFileSystem,
    destinationPath,
    currentWorkingDirectory
  );
  const destinationStat = await safeStat(workspaceFileSystem, normalizedDestination);
  if (destinationStat?.kind === 'directory') {
    const sourceName = basename(sourcePath);
    return resolveWorkspacePath(
      workspaceFileSystem,
      `${normalizedDestination}/${sourceName}`,
      currentWorkingDirectory
    );
  }
  return normalizedDestination;
}

function parseLineCountArguments(commandName, args, { allowPathless = false } = {}) {
  if (!args.length) {
    return {
      count: 10,
      path: null,
    };
  }
  let count = 10;
  const remaining = [...args];
  if (remaining[0] === '-n') {
    if (remaining.length < 3) {
      throw new Error(`${commandName}: -n requires a count and a file path.`);
    }
    count = Number(remaining[1]);
    remaining.splice(0, 2);
  } else if (/^-n\d+$/.test(remaining[0])) {
    count = Number(remaining[0].slice(2));
    remaining.shift();
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${commandName}: line count must be a non-negative integer.`);
  }
  if (!remaining.length && allowPathless) {
    return {
      count,
      path: null,
    };
  }
  if (remaining.length !== 1) {
    throw new Error(`${commandName}: expected exactly one file path.`);
  }
  return {
    count,
    path: remaining[0],
  };
}

async function runPwd(commandText, args, currentWorkingDirectory) {
  if (args.length) {
    return createShellError(
      commandText,
      'pwd',
      'this subset does not accept arguments.',
      2,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    stdout: currentWorkingDirectory,
    currentWorkingDirectory,
  });
}

async function runBasename(commandText, args, currentWorkingDirectory) {
  if (args.length !== 1) {
    return createShellError(
      commandText,
      'basename',
      'expected exactly one path.',
      2,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    stdout: basename(args[0]),
    currentWorkingDirectory,
  });
}

async function runDirname(commandText, args, currentWorkingDirectory) {
  if (args.length !== 1) {
    return createShellError(
      commandText,
      'dirname',
      'expected exactly one path.',
      2,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    stdout: dirname(args[0]),
    currentWorkingDirectory,
  });
}

async function runPrintf(commandText, args, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'printf',
      'expected a format string.',
      2,
      currentWorkingDirectory
    );
  }
  try {
    return createShellResult(commandText, {
      stdout: formatPrintfOutput(args[0], args.slice(1)),
      currentWorkingDirectory,
    });
  } catch (error) {
    return createShellError(
      commandText,
      'printf',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }
}

async function runTrue(commandText, args, currentWorkingDirectory) {
  if (args.length) {
    return createShellError(
      commandText,
      'true',
      'this subset does not accept arguments.',
      2,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    currentWorkingDirectory,
  });
}

async function runFalse(commandText, args, currentWorkingDirectory) {
  if (args.length) {
    return createShellError(
      commandText,
      'false',
      'this subset does not accept arguments.',
      2,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    exitCode: 1,
    currentWorkingDirectory,
  });
}

async function runCd(
  commandText,
  args,
  workspaceFileSystem,
  runtimeContext,
  currentWorkingDirectory
) {
  if (args.length > 1) {
    return createShellError(
      commandText,
      'cd',
      'expected zero or one directory path.',
      2,
      currentWorkingDirectory
    );
  }
  let normalizedPath;
  try {
    normalizedPath = resolveWorkspacePath(
      workspaceFileSystem,
      args[0] || WORKSPACE_ROOT_PATH,
      currentWorkingDirectory
    );
  } catch (error) {
    return createShellError(
      commandText,
      'cd',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  const stat = await safeStat(workspaceFileSystem, normalizedPath);
  if (!stat) {
    return createShellError(
      commandText,
      'cd',
      `no such file or directory: ${args[0] || WORKSPACE_ROOT_PATH}.`,
      1,
      currentWorkingDirectory
    );
  }
  if (stat.kind !== 'directory') {
    return createShellError(
      commandText,
      'cd',
      `'${args[0]}' is not a directory.`,
      1,
      currentWorkingDirectory
    );
  }
  const nextWorkingDirectory = setCurrentWorkingDirectory(runtimeContext, normalizedPath);
  return createShellResult(commandText, {
    currentWorkingDirectory: nextWorkingDirectory,
  });
}

async function runEcho(commandText, args, currentWorkingDirectory) {
  return createShellResult(commandText, {
    stdout: args.join(' '),
    currentWorkingDirectory,
  });
}

async function runSet(commandText, args, runtimeContext, currentWorkingDirectory) {
  if (!args.length) {
    const userVariables = Object.entries(getShellVariables(runtimeContext))
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([name, value]) => `${name}=${value}`);
    const builtinVariables = [`PWD=${currentWorkingDirectory}`, `WORKSPACE=${WORKSPACE_ROOT_PATH}`];
    return createShellResult(commandText, {
      stdout: [...builtinVariables, ...userVariables].join('\n'),
      currentWorkingDirectory,
    });
  }

  const assignmentMatch =
    args.length === 1 ? args[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) : null;
  const variableName = assignmentMatch ? assignmentMatch[1] : args[0];
  const variableValue = assignmentMatch ? assignmentMatch[2] : args.slice(1).join(' ');

  if (!isValidShellVariableName(variableName)) {
    return createShellError(
      commandText,
      'set',
      `invalid variable name '${variableName}'.`,
      2,
      currentWorkingDirectory
    );
  }
  if (isReadonlyShellVariable(variableName)) {
    return createShellError(
      commandText,
      'set',
      `cannot overwrite readonly variable '${variableName}'.`,
      1,
      currentWorkingDirectory
    );
  }
  if (!assignmentMatch && args.length < 2) {
    return createShellError(
      commandText,
      'set',
      'expected a variable name and value.',
      2,
      currentWorkingDirectory
    );
  }

  try {
    setShellVariable(runtimeContext, variableName, variableValue);
  } catch (error) {
    return createShellError(
      commandText,
      'set',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    currentWorkingDirectory,
  });
}

async function runUnset(commandText, args, runtimeContext, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'unset',
      'expected at least one variable name.',
      2,
      currentWorkingDirectory
    );
  }
  for (const variableName of args) {
    if (!isValidShellVariableName(variableName)) {
      return createShellError(
        commandText,
        'unset',
        `invalid variable name '${variableName}'.`,
        2,
        currentWorkingDirectory
      );
    }
    if (isReadonlyShellVariable(variableName)) {
      return createShellError(
        commandText,
        'unset',
        `cannot unset readonly variable '${variableName}'.`,
        1,
        currentWorkingDirectory
      );
    }
    unsetShellVariable(runtimeContext, variableName);
  }
  return createShellResult(commandText, {
    currentWorkingDirectory,
  });
}

async function runWhich(commandText, args, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'which',
      'expected at least one command name.',
      2,
      currentWorkingDirectory
    );
  }
  const supportedCommandNames = new Set(SHELL_COMMANDS.map((command) => command.name));
  const matches = args.filter((name) => supportedCommandNames.has(name));
  return createShellResult(commandText, {
    exitCode: matches.length === args.length ? 0 : 1,
    stdout: matches.join('\n'),
    currentWorkingDirectory,
  });
}

async function runLs(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  const paths = [];
  let longFormat = false;
  let singleColumn = false;
  let recursive = false;
  let listDirectoriesThemselves = false;
  let humanReadable = false;

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'l') {
          longFormat = true;
          continue;
        }
        if (flag === '1') {
          singleColumn = true;
          continue;
        }
        if (flag === 'R') {
          recursive = true;
          continue;
        }
        if (flag === 'd') {
          listDirectoriesThemselves = true;
          continue;
        }
        if (flag === 'h') {
          humanReadable = true;
          continue;
        }
        if (flag === 'a') {
          continue;
        }
        return createShellError(
          commandText,
          'ls',
          `unsupported option -${flag}.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    paths.push(argument);
  }

  const targetPaths = paths.length ? paths : [currentWorkingDirectory];
  const outputs = [];
  const listOptions = {
    longFormat,
    humanReadable,
    singleColumn,
  };

  for (const rawPath of targetPaths) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
    } catch (error) {
      return createShellError(
        commandText,
        'ls',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }

    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      return createShellError(
        commandText,
        'ls',
        `cannot access '${rawPath}': No such file or directory.`,
        2,
        currentWorkingDirectory
      );
    }

    let section = '';
    if (stat.kind === 'directory' && !listDirectoriesThemselves) {
      if (recursive) {
        const sections = await listDirectoryRecursively(
          workspaceFileSystem,
          normalizedPath,
          listOptions
        );
        section = sections
          .map(({ path, lines }) => `${path}:\n${lines.join('\n')}`.trimEnd())
          .join('\n\n');
      } else {
        const entries = await workspaceFileSystem.listDirectory(normalizedPath);
        const lines = entries.map((entry) => formatLsEntry(entry, listOptions));
        section = lines.join('\n');
      }
    } else {
      section = formatLsEntry(
        {
          ...stat,
          name: basename(normalizedPath),
        },
        listOptions
      );
    }

    if (targetPaths.length > 1 && !recursive) {
      outputs.push(`${normalizedPath}:\n${section}`.trimEnd());
    } else {
      outputs.push(section);
    }
  }

  const stdout = outputs.filter(Boolean).join('\n\n');

  return createShellResult(commandText, {
    stdout: singleColumn ? stdout : stdout,
    currentWorkingDirectory,
  });
}

async function readWorkspaceTextFile(
  commandName,
  commandText,
  rawPath,
  workspaceFileSystem,
  currentWorkingDirectory
) {
  let normalizedPath;
  try {
    normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
  } catch (error) {
    return {
      error: createShellError(
        commandText,
        commandName,
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      ),
    };
  }
  const stat = await safeStat(workspaceFileSystem, normalizedPath);
  if (!stat) {
    return {
      error: createShellError(
        commandText,
        commandName,
        `cannot open '${rawPath}': No such file or directory.`,
        1,
        currentWorkingDirectory
      ),
    };
  }
  if (stat.kind !== 'file') {
    return {
      error: createShellError(
        commandText,
        commandName,
        `'${rawPath}' is not a file.`,
        1,
        currentWorkingDirectory
      ),
    };
  }
  return {
    path: normalizedPath,
    text: await workspaceFileSystem.readTextFile(normalizedPath),
  };
}

function hasPipelineStdin(stdinText) {
  return stdinText !== null && stdinText !== undefined;
}

function isBlankCatLine(line) {
  return line.trim() === '';
}

function formatCatText(
  text,
  { numberAllLines = false, numberNonBlankLines = false, squeezeBlank = false } = {}
) {
  const normalizedText = String(text || '');
  const trailingNewline = /\r?\n$/.test(normalizedText);
  const lines = normalizedText.split(/\r?\n/);
  if (trailingNewline) {
    lines.pop();
  }

  const outputLines = [];
  let lineNumber = 1;
  let previousWasBlank = false;

  for (const line of lines) {
    const blankLine = isBlankCatLine(line);
    if (squeezeBlank && blankLine && previousWasBlank) {
      continue;
    }
    previousWasBlank = blankLine;

    const shouldNumberLine = numberNonBlankLines ? !blankLine : numberAllLines;
    if (shouldNumberLine) {
      outputLines.push(`${String(lineNumber).padStart(6, ' ')}\t${line}`);
      lineNumber += 1;
      continue;
    }
    outputLines.push(line);
  }

  const outputText = outputLines.join('\n');
  return trailingNewline ? `${outputText}\n` : outputText;
}

async function runCat(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let numberAllLines = false;
  let numberNonBlankLines = false;
  let squeezeBlank = false;
  const filePaths = [];

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument === '--number') {
      numberAllLines = true;
      continue;
    }
    if (argument === '--number-nonblank') {
      numberNonBlankLines = true;
      continue;
    }
    if (argument === '--squeeze-blank') {
      squeezeBlank = true;
      continue;
    }
    if (argument.startsWith('--')) {
      return createShellError(
        commandText,
        'cat',
        `unrecognized option '${argument}'.`,
        2,
        currentWorkingDirectory
      );
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'n') {
          numberAllLines = true;
          continue;
        }
        if (flag === 'b') {
          numberNonBlankLines = true;
          continue;
        }
        if (flag === 's') {
          squeezeBlank = true;
          continue;
        }
        return createShellError(
          commandText,
          'cat',
          `invalid option -- '${flag}'.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    filePaths.push(argument);
  }

  if (!filePaths.length && !hasPipelineStdin(stdinText)) {
    return createShellError(
      commandText,
      'cat',
      'expected at least one file path.',
      2,
      currentWorkingDirectory
    );
  }
  const chunks = [];
  if (!filePaths.length) {
    chunks.push(String(stdinText ?? ''));
  }
  for (const rawPath of filePaths) {
    const fileResult = await readWorkspaceTextFile(
      'cat',
      commandText,
      rawPath,
      workspaceFileSystem,
      currentWorkingDirectory
    );
    if (fileResult.error) {
      return fileResult.error;
    }
    chunks.push(fileResult.text);
  }
  const combinedText = chunks.join('');
  return createShellResult(commandText, {
    stdout: formatCatText(combinedText, {
      numberAllLines,
      numberNonBlankLines,
      squeezeBlank,
    }),
    currentWorkingDirectory,
  });
}

async function runHead(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('head', args, {
      allowPathless: hasPipelineStdin(stdinText),
    });
  } catch (error) {
    return createShellError(
      commandText,
      'head',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }
  const sourceTextResult =
    parsedArguments.path === null
      ? String(stdinText ?? '')
      : await readWorkspaceTextFile(
          'head',
          commandText,
          parsedArguments.path,
          workspaceFileSystem,
          currentWorkingDirectory
        );
  if (typeof sourceTextResult !== 'string' && sourceTextResult?.error) {
    return sourceTextResult.error;
  }
  const sourceText =
    typeof sourceTextResult === 'string' ? sourceTextResult : sourceTextResult.text;
  const { lines, trailingNewline } = splitShellTextIntoLines(
    sourceText
  );
  const selectedLines = lines.slice(0, parsedArguments.count);
  return createShellResult(commandText, {
    stdout: joinShellLines(
      selectedLines,
      selectedLines.length > 0 && (trailingNewline || selectedLines.length < lines.length)
    ),
    currentWorkingDirectory,
  });
}

async function runTail(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('tail', args, {
      allowPathless: hasPipelineStdin(stdinText),
    });
  } catch (error) {
    return createShellError(
      commandText,
      'tail',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }
  const sourceTextResult =
    parsedArguments.path === null
      ? String(stdinText ?? '')
      : await readWorkspaceTextFile(
          'tail',
          commandText,
          parsedArguments.path,
          workspaceFileSystem,
          currentWorkingDirectory
        );
  if (typeof sourceTextResult !== 'string' && sourceTextResult?.error) {
    return sourceTextResult.error;
  }
  const sourceText =
    typeof sourceTextResult === 'string' ? sourceTextResult : sourceTextResult.text;
  const { lines, trailingNewline } = splitShellTextIntoLines(
    sourceText
  );
  const selectedLines = lines.slice(Math.max(0, lines.length - parsedArguments.count));
  return createShellResult(commandText, {
    stdout: joinShellLines(selectedLines, selectedLines.length > 0 && trailingNewline),
    currentWorkingDirectory,
  });
}

async function runWc(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let mode = 'all';
  const remaining = [...args];
  if (remaining[0]?.startsWith('-')) {
    mode = remaining.shift();
  }
  const useStdin = remaining.length === 0 && hasPipelineStdin(stdinText);
  if (!useStdin && remaining.length !== 1) {
    return createShellError(
      commandText,
      'wc',
      'expected one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'wc',
        commandText,
        remaining[0],
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const lineCount = countLines(fileResult.text);
  const wordCount = countWords(fileResult.text);
  const byteCount = getTextEncoder().encode(fileResult.text).byteLength;
  const targetSuffix = fileResult.path ? ` ${fileResult.path}` : '';
  let stdout = '';

  if (mode === '-l') {
    stdout = `${lineCount}${targetSuffix}`;
  } else if (mode === '-w') {
    stdout = `${wordCount}${targetSuffix}`;
  } else if (mode === '-c') {
    stdout = `${byteCount}${targetSuffix}`;
  } else if (mode === 'all') {
    stdout = `${lineCount} ${wordCount} ${byteCount}${targetSuffix}`;
  } else {
    return createShellError(
      commandText,
      'wc',
      `unsupported option ${mode}.`,
      2,
      currentWorkingDirectory
    );
  }

  return createShellResult(commandText, { stdout, currentWorkingDirectory });
}

function splitShellTextIntoLines(text) {
  const normalizedText = String(text || '');
  const trailingNewline = /\r?\n$/.test(normalizedText);
  const lines = normalizedText.split(/\r?\n/);
  if (trailingNewline) {
    lines.pop();
  }
  return {
    lines,
    trailingNewline,
  };
}

function joinShellLines(lines, trailingNewline = false) {
  const output = (Array.isArray(lines) ? lines : []).join('\n');
  return trailingNewline ? `${output}\n` : output;
}

function splitFieldsForShellTable(line, delimiter = null) {
  const normalizedLine = String(line || '');
  if (delimiter === null) {
    const trimmed = normalizedLine.trim();
    return trimmed ? trimmed.split(/\s+/) : [];
  }
  return normalizedLine.split(delimiter);
}

function padRight(text, width) {
  const normalizedText = String(text ?? '');
  return normalizedText.padEnd(Math.max(0, width), ' ');
}

function getPasteDelimiterAt(delimiters, index) {
  const normalizedDelimiters = String(delimiters || '\t');
  if (!normalizedDelimiters) {
    return '';
  }
  return normalizedDelimiters[index % normalizedDelimiters.length];
}

function hasPrefix(bytes, prefix) {
  if (!(bytes instanceof Uint8Array) || bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => bytes[index] === value);
}

function hasGifHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 6) {
    return false;
  }
  const header = Array.from(bytes.slice(0, 6))
    .map((value) => String.fromCharCode(value))
    .join('');
  return header === 'GIF87a' || header === 'GIF89a';
}

function decodeUtf8Bytes(bytes) {
  try {
    return getUtf8TextDecoder({ fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isLikelyReadableText(text) {
  if (typeof text !== 'string') {
    return false;
  }
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13) {
      continue;
    }
    if (code < 32 || (code >= 127 && code <= 159)) {
      return false;
    }
  }
  return true;
}

function parseSedDelimitedSection(script, startIndex, delimiter, label) {
  let value = '';
  let escaped = false;

  for (let index = startIndex; index < script.length; index += 1) {
    const character = script[index];
    if (escaped) {
      value += character === delimiter ? character : `\\${character}`;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === delimiter) {
      return {
        value,
        nextIndex: index + 1,
      };
    }
    value += character;
  }

  throw new Error(`unterminated ${label}.`);
}

function parseSedAddressUnit(script, startIndex) {
  const character = script[startIndex];
  if (!character) {
    return null;
  }
  if (character === '$') {
    return {
      address: {
        type: 'last-line',
      },
      nextIndex: startIndex + 1,
    };
  }
  if (/\d/.test(character)) {
    let endIndex = startIndex + 1;
    while (endIndex < script.length && /\d/.test(script[endIndex])) {
      endIndex += 1;
    }
    return {
      address: {
        type: 'line-number',
        value: Number.parseInt(script.slice(startIndex, endIndex), 10),
      },
      nextIndex: endIndex,
    };
  }
  if (character === '/') {
    const regexSection = parseSedDelimitedSection(script, startIndex + 1, '/', 'address regex');
    if (!regexSection.value) {
      throw new Error('address regex cannot be empty.');
    }
    let regex;
    try {
      regex = new RegExp(regexSection.value);
    } catch (error) {
      throw new Error(
        `invalid address regex: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return {
      address: {
        type: 'regex',
        value: regex,
      },
      nextIndex: regexSection.nextIndex,
    };
  }
  return null;
}

function parseSedSubstituteCommand(script, startIndex) {
  if (script[startIndex] !== 's') {
    return null;
  }
  const delimiter = script[startIndex + 1];
  if (!delimiter) {
    throw new Error('substitute command requires a delimiter.');
  }
  const patternSection = parseSedDelimitedSection(
    script,
    startIndex + 2,
    delimiter,
    'substitute pattern'
  );
  if (!patternSection.value) {
    throw new Error('substitute pattern cannot be empty.');
  }
  const replacementSection = parseSedDelimitedSection(
    script,
    patternSection.nextIndex,
    delimiter,
    'substitute replacement'
  );
  const flagsText = script.slice(replacementSection.nextIndex).trim();
  if (flagsText && flagsText !== 'g') {
    throw new Error(`unsupported substitute flags '${flagsText}'.`);
  }

  let regex;
  try {
    regex = new RegExp(patternSection.value, flagsText === 'g' ? 'g' : '');
  } catch (error) {
    throw new Error(
      `invalid substitute regex: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    command: {
      type: 'substitute',
      regex,
      replacement: replacementSection.value,
      global: flagsText === 'g',
    },
    nextIndex: script.length,
  };
}

function parseSedScript(script) {
  const normalizedScript = String(script || '').trim();
  if (!normalizedScript) {
    throw new Error('script must be a non-empty string.');
  }

  let cursor = 0;
  const firstAddress = parseSedAddressUnit(normalizedScript, cursor);
  let address = null;

  if (firstAddress) {
    cursor = firstAddress.nextIndex;
    if (normalizedScript[cursor] === ',') {
      const secondAddress = parseSedAddressUnit(normalizedScript, cursor + 1);
      if (!secondAddress) {
        throw new Error('range address is missing its end selector.');
      }
      address = {
        type: 'range',
        start: firstAddress.address,
        end: secondAddress.address,
      };
      cursor = secondAddress.nextIndex;
    } else {
      address = firstAddress.address;
    }
  }

  const remainingScript = normalizedScript.slice(cursor).trim();
  if (!remainingScript) {
    throw new Error('script is missing a command.');
  }

  if (remainingScript === 'p' || remainingScript === 'd') {
    return {
      address,
      command: {
        type: remainingScript === 'p' ? 'print' : 'delete',
      },
    };
  }

  const substituteCommand = parseSedSubstituteCommand(remainingScript, 0);
  if (substituteCommand) {
    return {
      address,
      command: substituteCommand.command,
    };
  }

  throw new Error(`unsupported sed script '${normalizedScript}'.`);
}

function matchSedAddressUnit(address, lineText, lineNumber, totalLineCount) {
  if (!address || typeof address !== 'object') {
    return true;
  }
  if (address.type === 'line-number') {
    return lineNumber === address.value;
  }
  if (address.type === 'last-line') {
    return lineNumber === totalLineCount;
  }
  if (address.type === 'regex') {
    return address.value.test(lineText);
  }
  return false;
}

function createSedAddressMatcher(address, totalLineCount) {
  if (!address) {
    return () => true;
  }
  if (address.type !== 'range') {
    return (lineText, lineNumber) =>
      matchSedAddressUnit(address, lineText, lineNumber, totalLineCount);
  }

  let inRange = false;
  return (lineText, lineNumber) => {
    if (!inRange) {
      const startMatched = matchSedAddressUnit(address.start, lineText, lineNumber, totalLineCount);
      if (!startMatched) {
        return false;
      }
      const endMatched = matchSedAddressUnit(address.end, lineText, lineNumber, totalLineCount);
      inRange = !endMatched;
      return true;
    }

    const endMatched = matchSedAddressUnit(address.end, lineText, lineNumber, totalLineCount);
    if (endMatched) {
      inRange = false;
    }
    return true;
  };
}

function applySedReplacement(replacement, matchedText) {
  const normalizedReplacement = String(replacement || '');
  let output = '';
  let escaped = false;

  for (const character of normalizedReplacement) {
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '&') {
      output += matchedText;
      continue;
    }
    output += character;
  }

  if (escaped) {
    output += '\\';
  }
  return output;
}

function executeSedSubstitute(lineText, command) {
  return String(lineText || '').replace(command.regex, (matchedText) =>
    applySedReplacement(command.replacement, matchedText)
  );
}

function describeFileBytes(path, bytes) {
  const normalizedBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  if (normalizedBytes.byteLength === 0) {
    return 'empty';
  }
  if (hasPrefix(normalizedBytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'PDF document';
  }
  if (hasPrefix(normalizedBytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'PNG image data';
  }
  if (hasPrefix(normalizedBytes, [0xff, 0xd8, 0xff])) {
    return 'JPEG image data';
  }
  if (hasGifHeader(normalizedBytes)) {
    return 'GIF image data';
  }

  const decodedText = decodeUtf8Bytes(normalizedBytes);
  if (decodedText !== null && isLikelyReadableText(decodedText)) {
    const extensionDescription = FILE_EXTENSION_DESCRIPTIONS[getFileExtension(path)];
    if (extensionDescription && !/(pdf|png|jpeg|gif)/i.test(extensionDescription)) {
      return extensionDescription;
    }
    return Array.from(normalizedBytes).every((value) => value <= 0x7f)
      ? 'ASCII text'
      : 'UTF-8 Unicode text';
  }

  const extensionDescription = FILE_EXTENSION_DESCRIPTIONS[getFileExtension(path)];
  return extensionDescription || 'data';
}

function buildDiffLineOperations(leftLines, rightLines) {
  const normalizedLeftLines = Array.isArray(leftLines) ? leftLines : [];
  const normalizedRightLines = Array.isArray(rightLines) ? rightLines : [];
  const matrixCellCount = (normalizedLeftLines.length + 1) * (normalizedRightLines.length + 1);
  if (matrixCellCount > MAX_DIFF_MATRIX_CELLS) {
    return null;
  }

  const lcsLengths = Array.from(
    { length: normalizedLeftLines.length + 1 },
    () => new Uint32Array(normalizedRightLines.length + 1)
  );

  for (let leftIndex = normalizedLeftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = normalizedRightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lcsLengths[leftIndex][rightIndex] =
        normalizedLeftLines[leftIndex] === normalizedRightLines[rightIndex]
          ? lcsLengths[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(lcsLengths[leftIndex + 1][rightIndex], lcsLengths[leftIndex][rightIndex + 1]);
    }
  }

  const operations = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < normalizedLeftLines.length && rightIndex < normalizedRightLines.length) {
    if (normalizedLeftLines[leftIndex] === normalizedRightLines[rightIndex]) {
      operations.push({
        type: 'equal',
        line: normalizedLeftLines[leftIndex],
        leftIndexBefore: leftIndex,
        rightIndexBefore: rightIndex,
      });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    if (lcsLengths[leftIndex + 1][rightIndex] >= lcsLengths[leftIndex][rightIndex + 1]) {
      operations.push({
        type: 'delete',
        line: normalizedLeftLines[leftIndex],
        leftIndexBefore: leftIndex,
        rightIndexBefore: rightIndex,
      });
      leftIndex += 1;
      continue;
    }

    operations.push({
      type: 'insert',
      line: normalizedRightLines[rightIndex],
      leftIndexBefore: leftIndex,
      rightIndexBefore: rightIndex,
    });
    rightIndex += 1;
  }

  while (leftIndex < normalizedLeftLines.length) {
    operations.push({
      type: 'delete',
      line: normalizedLeftLines[leftIndex],
      leftIndexBefore: leftIndex,
      rightIndexBefore: rightIndex,
    });
    leftIndex += 1;
  }

  while (rightIndex < normalizedRightLines.length) {
    operations.push({
      type: 'insert',
      line: normalizedRightLines[rightIndex],
      leftIndexBefore: leftIndex,
      rightIndexBefore: rightIndex,
    });
    rightIndex += 1;
  }

  return operations;
}

function getUnifiedDiffStartLine(indexBefore, lineCount) {
  return lineCount === 0 ? indexBefore : indexBefore + 1;
}

function formatUnifiedDiffRange(startLine, lineCount) {
  if (lineCount === 1) {
    return String(startLine);
  }
  return `${startLine},${lineCount}`;
}

function buildUnifiedDiffHunks(operations, contextLineCount = DEFAULT_DIFF_CONTEXT_LINES) {
  const normalizedOperations = Array.isArray(operations) ? operations : [];
  const changeIndexes = normalizedOperations.reduce((indexes, operation, index) => {
    if (operation?.type !== 'equal') {
      indexes.push(index);
    }
    return indexes;
  }, []);
  if (!changeIndexes.length) {
    return [];
  }

  const hunks = [];
  let hunkStart = Math.max(0, changeIndexes[0] - contextLineCount);
  let hunkEnd = Math.min(normalizedOperations.length, changeIndexes[0] + contextLineCount + 1);

  for (let index = 1; index < changeIndexes.length; index += 1) {
    const nextChangeIndex = changeIndexes[index];
    const nextStart = Math.max(0, nextChangeIndex - contextLineCount);
    const nextEnd = Math.min(normalizedOperations.length, nextChangeIndex + contextLineCount + 1);
    if (nextStart <= hunkEnd) {
      hunkEnd = Math.max(hunkEnd, nextEnd);
      continue;
    }
    hunks.push({ start: hunkStart, end: hunkEnd });
    hunkStart = nextStart;
    hunkEnd = nextEnd;
  }
  hunks.push({ start: hunkStart, end: hunkEnd });

  return hunks.map(({ start, end }) => {
    const slice = normalizedOperations.slice(start, end);
    const leftLineCount = slice.filter((operation) => operation.type !== 'insert').length;
    const rightLineCount = slice.filter((operation) => operation.type !== 'delete').length;
    const firstOperation = slice[0] || {
      leftIndexBefore: 0,
      rightIndexBefore: 0,
    };
    return {
      leftStartLine: getUnifiedDiffStartLine(firstOperation.leftIndexBefore, leftLineCount),
      leftLineCount,
      rightStartLine: getUnifiedDiffStartLine(firstOperation.rightIndexBefore, rightLineCount),
      rightLineCount,
      lines: slice.map((operation) => {
        if (operation.type === 'delete') {
          return `-${operation.line}`;
        }
        if (operation.type === 'insert') {
          return `+${operation.line}`;
        }
        return ` ${operation.line}`;
      }),
    };
  });
}

function formatUnifiedDiffOutput(leftPath, rightPath, hunks) {
  const outputLines = [`--- ${leftPath}`, `+++ ${rightPath}`];
  for (const hunk of Array.isArray(hunks) ? hunks : []) {
    outputLines.push(
      `@@ -${formatUnifiedDiffRange(hunk.leftStartLine, hunk.leftLineCount)} +${formatUnifiedDiffRange(hunk.rightStartLine, hunk.rightLineCount)} @@`
    );
    outputLines.push(...hunk.lines);
  }
  return outputLines.join('\n');
}

function parseCutFieldSpec(specification) {
  const rawSpec = String(specification || '').trim();
  if (!rawSpec) {
    throw new Error('missing field list.');
  }
  const indexes = new Set();
  for (const part of rawSpec.split(',')) {
    const trimmedPart = part.trim();
    if (!trimmedPart) {
      throw new Error('invalid field list.');
    }
    const rangeMatch = trimmedPart.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (start < 1 || end < start) {
        throw new Error('invalid field range.');
      }
      for (let index = start; index <= end; index += 1) {
        indexes.add(index);
      }
      continue;
    }
    const singleIndex = Number.parseInt(trimmedPart, 10);
    if (!Number.isInteger(singleIndex) || singleIndex < 1) {
      throw new Error('field numbers must be positive integers.');
    }
    indexes.add(singleIndex);
  }
  return [...indexes].sort((left, right) => left - right);
}

function parsePositiveFieldIndex(value, label) {
  const parsedValue = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsedValue;
}

function translateCharacters(text, sourceSet, targetSet) {
  const sourceCharacters = Array.from(String(sourceSet || ''));
  const targetCharacters = Array.from(String(targetSet || ''));
  if (!sourceCharacters.length) {
    return String(text || '');
  }
  const lastTargetCharacter = targetCharacters[targetCharacters.length - 1] || '';
  return Array.from(String(text || ''), (character) => {
    const index = sourceCharacters.indexOf(character);
    if (index < 0) {
      return character;
    }
    return targetCharacters[index] ?? lastTargetCharacter;
  }).join('');
}

async function runSort(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let reverse = false;
  let numeric = false;
  const filePaths = [];

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'r') {
          reverse = true;
          continue;
        }
        if (flag === 'n') {
          numeric = true;
          continue;
        }
        return createShellError(
          commandText,
          'sort',
          `unsupported option -${flag}.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    filePaths.push(argument);
  }

  if (!filePaths.length && !hasPipelineStdin(stdinText)) {
    return createShellError(
      commandText,
      'sort',
      'expected at least one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const allLines = [];
  let trailingNewline = false;
  if (!filePaths.length) {
    const lineResult = splitShellTextIntoLines(String(stdinText ?? ''));
    allLines.push(...lineResult.lines);
    trailingNewline = lineResult.trailingNewline;
  }
  for (const rawPath of filePaths) {
    const fileResult = await readWorkspaceTextFile(
      'sort',
      commandText,
      rawPath,
      workspaceFileSystem,
      currentWorkingDirectory
    );
    if (fileResult.error) {
      return fileResult.error;
    }
    const lineResult = splitShellTextIntoLines(fileResult.text);
    allLines.push(...lineResult.lines);
    trailingNewline = lineResult.trailingNewline;
  }

  const sortedLines = [...allLines].sort((left, right) => {
    if (numeric) {
      const leftValue = Number(left);
      const rightValue = Number(right);
      const leftNumber = Number.isFinite(leftValue) ? leftValue : 0;
      const rightNumber = Number.isFinite(rightValue) ? rightValue : 0;
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });
  if (reverse) {
    sortedLines.reverse();
  }

  return createShellResult(commandText, {
    stdout: joinShellLines(sortedLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runUniq(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let countMode = false;
  const filePaths = [];

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'c') {
          countMode = true;
          continue;
        }
        return createShellError(
          commandText,
          'uniq',
          `unsupported option -${flag}.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    filePaths.push(argument);
  }

  const useStdin = filePaths.length === 0 && hasPipelineStdin(stdinText);
  if (!useStdin && filePaths.length !== 1) {
    return createShellError(
      commandText,
      'uniq',
      'expected exactly one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'uniq',
        commandText,
        filePaths[0],
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const { lines, trailingNewline } = splitShellTextIntoLines(fileResult.text);
  const outputLines = [];
  let previousLine = null;
  let count = 0;

  const flush = () => {
    if (previousLine === null) {
      return;
    }
    outputLines.push(
      countMode ? `${String(count).padStart(7, ' ')} ${previousLine}` : previousLine
    );
  };

  for (const line of lines) {
    if (previousLine === null) {
      previousLine = line;
      count = 1;
      continue;
    }
    if (line === previousLine) {
      count += 1;
      continue;
    }
    flush();
    previousLine = line;
    count = 1;
  }
  flush();

  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runCut(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  if (!args.length) {
    return createShellError(
      commandText,
      'cut',
      'expected options and one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let delimiter = '\t';
  let fieldSpec = '';
  const filePaths = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-d') {
      delimiter = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument === '-f') {
      fieldSpec = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'cut',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    filePaths.push(argument);
  }

  if (!fieldSpec) {
    return createShellError(
      commandText,
      'cut',
      'option -f requires a field list.',
      2,
      currentWorkingDirectory
    );
  }
  const useStdin = filePaths.length === 0 && hasPipelineStdin(stdinText);
  if (!useStdin && filePaths.length !== 1) {
    return createShellError(
      commandText,
      'cut',
      'expected exactly one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let fields;
  try {
    fields = parseCutFieldSpec(fieldSpec);
  } catch (error) {
    return createShellError(
      commandText,
      'cut',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }

  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'cut',
        commandText,
        filePaths[0],
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const { lines, trailingNewline } = splitShellTextIntoLines(fileResult.text);
  const outputLines = lines.map((line) => {
    const parts = String(line).split(delimiter);
    return fields
      .map((fieldIndex) => parts[fieldIndex - 1])
      .filter((value) => value !== undefined)
      .join(delimiter);
  });

  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runPaste(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'paste',
      'expected at least one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let delimiters = '\t';
  const filePaths = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-d') {
      delimiters = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'paste',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    filePaths.push(argument);
  }

  if (!filePaths.length) {
    return createShellError(
      commandText,
      'paste',
      'expected at least one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const fileLines = [];
  let trailingNewline = false;
  for (const rawPath of filePaths) {
    const fileResult = await readWorkspaceTextFile(
      'paste',
      commandText,
      rawPath,
      workspaceFileSystem,
      currentWorkingDirectory
    );
    if (fileResult.error) {
      return fileResult.error;
    }
    const lineResult = splitShellTextIntoLines(fileResult.text);
    fileLines.push(lineResult.lines);
    trailingNewline = trailingNewline || lineResult.trailingNewline;
  }

  const rowCount = fileLines.reduce((maximum, lines) => Math.max(maximum, lines.length), 0);
  const outputLines = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    let outputLine = '';
    for (let fileIndex = 0; fileIndex < fileLines.length; fileIndex += 1) {
      if (fileIndex > 0) {
        outputLine += getPasteDelimiterAt(delimiters, fileIndex - 1);
      }
      outputLine += fileLines[fileIndex][rowIndex] ?? '';
    }
    outputLines.push(outputLine);
  }

  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runJoin(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'join',
      'expected two file paths.',
      2,
      currentWorkingDirectory
    );
  }

  let leftFieldIndex = 1;
  let rightFieldIndex = 1;
  let delimiter = null;
  const filePaths = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-1') {
      try {
        leftFieldIndex = parsePositiveFieldIndex(args[index + 1], 'join field 1');
      } catch (error) {
        return createShellError(
          commandText,
          'join',
          error instanceof Error ? error.message : String(error),
          2,
          currentWorkingDirectory
        );
      }
      index += 1;
      continue;
    }
    if (argument === '-2') {
      try {
        rightFieldIndex = parsePositiveFieldIndex(args[index + 1], 'join field 2');
      } catch (error) {
        return createShellError(
          commandText,
          'join',
          error instanceof Error ? error.message : String(error),
          2,
          currentWorkingDirectory
        );
      }
      index += 1;
      continue;
    }
    if (argument === '-t') {
      delimiter = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'join',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    filePaths.push(argument);
  }

  if (filePaths.length !== 2) {
    return createShellError(
      commandText,
      'join',
      'expected exactly two file paths.',
      2,
      currentWorkingDirectory
    );
  }

  const leftFile = await readWorkspaceTextFile(
    'join',
    commandText,
    filePaths[0],
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (leftFile.error) {
    return leftFile.error;
  }

  const rightFile = await readWorkspaceTextFile(
    'join',
    commandText,
    filePaths[1],
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (rightFile.error) {
    return rightFile.error;
  }

  const leftLines = splitShellTextIntoLines(leftFile.text);
  const rightLines = splitShellTextIntoLines(rightFile.text);
  const separator = delimiter ?? ' ';

  const rightEntriesByKey = new Map();
  for (const line of rightLines.lines) {
    const fields = splitFieldsForShellTable(line, delimiter);
    const joinKey = fields[rightFieldIndex - 1];
    if (joinKey === undefined) {
      continue;
    }
    if (!rightEntriesByKey.has(joinKey)) {
      rightEntriesByKey.set(joinKey, []);
    }
    rightEntriesByKey.get(joinKey).push(fields);
  }

  const outputLines = [];
  for (const line of leftLines.lines) {
    const leftFields = splitFieldsForShellTable(line, delimiter);
    const joinKey = leftFields[leftFieldIndex - 1];
    if (joinKey === undefined) {
      continue;
    }
    const rightMatches = rightEntriesByKey.get(joinKey) || [];
    for (const rightFields of rightMatches) {
      const leftRemainder = leftFields.filter((_field, index) => index !== leftFieldIndex - 1);
      const rightRemainder = rightFields.filter((_field, index) => index !== rightFieldIndex - 1);
      outputLines.push([joinKey, ...leftRemainder, ...rightRemainder].join(separator));
    }
  }

  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, leftLines.trailingNewline || rightLines.trailingNewline),
    currentWorkingDirectory,
  });
}

async function runColumn(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'column',
      'expected one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let tableMode = false;
  let separator = null;
  const filePaths = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '-t') {
      tableMode = true;
      continue;
    }
    if (argument === '-s') {
      separator = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'column',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    filePaths.push(argument);
  }

  if (filePaths.length !== 1) {
    return createShellError(
      commandText,
      'column',
      'expected exactly one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const fileResult = await readWorkspaceTextFile(
    'column',
    commandText,
    filePaths[0],
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (fileResult.error) {
    return fileResult.error;
  }

  const { lines, trailingNewline } = splitShellTextIntoLines(fileResult.text);
  const rows = lines.map((line) => splitFieldsForShellTable(line, separator));
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const widths = Array.from({ length: columnCount }, (_, columnIndex) =>
    rows.reduce((maximum, row) => Math.max(maximum, String(row[columnIndex] ?? '').length), 0)
  );

  const outputLines = rows.map((row) => {
    if (!tableMode && separator !== null) {
      return row.join(separator);
    }
    return row
      .map((cell, columnIndex) => {
        const text = String(cell ?? '');
        if (columnIndex === row.length - 1) {
          return text;
        }
        return `${padRight(text, widths[columnIndex])}  `;
      })
      .join('');
  });

  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runTr(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  if (!args.length) {
    return createShellError(
      commandText,
      'tr',
      'expected character sets and one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let deleteMode = false;
  const positional = [];

  for (const argument of args) {
    if (argument === '-d') {
      deleteMode = true;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'tr',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    positional.push(argument);
  }

  const useStdin =
    (deleteMode ? positional.length === 1 : positional.length === 2) && hasPipelineStdin(stdinText);
  if (!useStdin && (deleteMode ? positional.length !== 2 : positional.length !== 3)) {
    return createShellError(
      commandText,
      'tr',
      deleteMode
        ? 'expected a character set and one file path.'
        : 'expected source set, target set, and one file path.',
      2,
      currentWorkingDirectory
    );
  }

  const [set1, set2OrPath, maybePath] = positional;
  const filePath = deleteMode ? set2OrPath : maybePath;
  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'tr',
        commandText,
        filePath,
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const stdout = deleteMode
    ? Array.from(String(fileResult.text))
        .filter((character) => !String(set1).includes(character))
        .join('')
    : translateCharacters(fileResult.text, set1, set2OrPath);

  return createShellResult(commandText, {
    stdout,
    currentWorkingDirectory,
  });
}

async function runNl(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  const useStdin = args.length === 0 && hasPipelineStdin(stdinText);
  if (!useStdin && args.length !== 1) {
    return createShellError(
      commandText,
      'nl',
      'expected exactly one file path.',
      2,
      currentWorkingDirectory
    );
  }
  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'nl',
        commandText,
        args[0],
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const { lines, trailingNewline } = splitShellTextIntoLines(fileResult.text);
  const outputLines = lines.map((line, index) => `${String(index + 1).padStart(6, ' ')}\t${line}`);
  return createShellResult(commandText, {
    stdout: joinShellLines(outputLines, trailingNewline),
    currentWorkingDirectory,
  });
}

async function runMkdir(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'mkdir',
      'expected at least one directory path.',
      2,
      currentWorkingDirectory
    );
  }
  const directoryArgs = [];
  for (const argument of args) {
    if (argument === '-p') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'mkdir',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    directoryArgs.push(argument);
  }
  if (!directoryArgs.length) {
    return createShellError(
      commandText,
      'mkdir',
      'expected at least one directory path.',
      2,
      currentWorkingDirectory
    );
  }
  for (const rawPath of directoryArgs) {
    try {
      await workspaceFileSystem.ensureDirectory(
        resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory)
      );
    } catch (error) {
      return createShellError(
        commandText,
        'mkdir',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
  }
  return createShellResult(commandText, { currentWorkingDirectory });
}

async function runRmdir(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'rmdir',
      'expected at least one directory path.',
      2,
      currentWorkingDirectory
    );
  }
  for (const rawPath of args) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
    } catch (error) {
      return createShellError(
        commandText,
        'rmdir',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      return createShellError(
        commandText,
        'rmdir',
        `failed to remove '${rawPath}': No such file or directory.`,
        1,
        currentWorkingDirectory
      );
    }
    if (stat.kind !== 'directory') {
      return createShellError(
        commandText,
        'rmdir',
        `failed to remove '${rawPath}': Not a directory.`,
        1,
        currentWorkingDirectory
      );
    }
    try {
      await workspaceFileSystem.deletePath(normalizedPath, { recursive: false });
    } catch (error) {
      return createShellError(
        commandText,
        'rmdir',
        `failed to remove '${rawPath}': ${error instanceof Error ? error.message : String(error)}`,
        1,
        currentWorkingDirectory
      );
    }
  }
  return createShellResult(commandText, { currentWorkingDirectory });
}

async function runMktemp(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  let createDirectory = false;
  const positionalArgs = [];

  for (const argument of args) {
    if (argument === '-d') {
      createDirectory = true;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'mktemp',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    positionalArgs.push(argument);
  }

  if (positionalArgs.length > 1) {
    return createShellError(
      commandText,
      'mktemp',
      'expected zero or one template path.',
      2,
      currentWorkingDirectory
    );
  }

  const templatePath = getMktempTemplatePath(positionalArgs[0], currentWorkingDirectory);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(
        workspaceFileSystem,
        fillMktempTemplate(templatePath),
        currentWorkingDirectory
      );
    } catch (error) {
      return createShellError(
        commandText,
        'mktemp',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    if (await safeStat(workspaceFileSystem, normalizedPath)) {
      continue;
    }
    try {
      if (createDirectory) {
        await workspaceFileSystem.ensureDirectory(normalizedPath);
      } else {
        await workspaceFileSystem.writeTextFile(normalizedPath, '');
      }
    } catch (error) {
      return createShellError(
        commandText,
        'mktemp',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    return createShellResult(commandText, {
      stdout: normalizedPath,
      currentWorkingDirectory,
    });
  }

  return createShellError(
    commandText,
    'mktemp',
    'unable to allocate a unique temporary path.',
    1,
    currentWorkingDirectory
  );
}

async function runTouch(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'touch',
      'expected at least one file path.',
      2,
      currentWorkingDirectory
    );
  }
  for (const rawPath of args) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
    } catch (error) {
      return createShellError(
        commandText,
        'touch',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (stat?.kind === 'directory') {
      return createShellError(
        commandText,
        'touch',
        `'${rawPath}' is a directory.`,
        1,
        currentWorkingDirectory
      );
    }
    if (!stat) {
      await workspaceFileSystem.writeTextFile(normalizedPath, '');
    }
  }
  return createShellResult(commandText, { currentWorkingDirectory });
}

async function runCp(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (args.length !== 2) {
    return createShellError(
      commandText,
      'cp',
      'expected a source path and a destination path.',
      2,
      currentWorkingDirectory
    );
  }
  let sourcePath;
  try {
    sourcePath = resolveWorkspacePath(workspaceFileSystem, args[0], currentWorkingDirectory);
  } catch (error) {
    return createShellError(
      commandText,
      'cp',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  const sourceStat = await safeStat(workspaceFileSystem, sourcePath);
  if (!sourceStat) {
    return createShellError(
      commandText,
      'cp',
      `cannot stat '${args[0]}': No such file or directory.`,
      1,
      currentWorkingDirectory
    );
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(
      commandText,
      'cp',
      'only file copies are supported in this subset.',
      1,
      currentWorkingDirectory
    );
  }
  let destinationPath;
  try {
    destinationPath = await resolveOutputPath(
      workspaceFileSystem,
      args[1],
      sourcePath,
      currentWorkingDirectory
    );
  } catch (error) {
    return createShellError(
      commandText,
      'cp',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  if (destinationPath === sourcePath) {
    return createShellError(
      commandText,
      'cp',
      `'${args[0]}' and '${args[1]}' resolve to the same file.`,
      1,
      currentWorkingDirectory
    );
  }
  try {
    const data = await workspaceFileSystem.readFile(sourcePath);
    await workspaceFileSystem.writeFile(destinationPath, data);
  } catch (error) {
    return createShellError(
      commandText,
      'cp',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    stdout: destinationPath,
    currentWorkingDirectory,
  });
}

async function runMv(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (args.length !== 2) {
    return createShellError(
      commandText,
      'mv',
      'expected a source path and a destination path.',
      2,
      currentWorkingDirectory
    );
  }
  let sourcePath;
  try {
    sourcePath = resolveWorkspacePath(workspaceFileSystem, args[0], currentWorkingDirectory);
  } catch (error) {
    return createShellError(
      commandText,
      'mv',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  const sourceStat = await safeStat(workspaceFileSystem, sourcePath);
  if (!sourceStat) {
    return createShellError(
      commandText,
      'mv',
      `cannot stat '${args[0]}': No such file or directory.`,
      1,
      currentWorkingDirectory
    );
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(
      commandText,
      'mv',
      'only file moves are supported in this subset.',
      1,
      currentWorkingDirectory
    );
  }
  let destinationPath;
  try {
    destinationPath = await resolveOutputPath(
      workspaceFileSystem,
      args[1],
      sourcePath,
      currentWorkingDirectory
    );
  } catch (error) {
    return createShellError(
      commandText,
      'mv',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  if (destinationPath === sourcePath) {
    return createShellError(
      commandText,
      'mv',
      `'${args[0]}' and '${args[1]}' resolve to the same file.`,
      1,
      currentWorkingDirectory
    );
  }
  try {
    const data = await workspaceFileSystem.readFile(sourcePath);
    await workspaceFileSystem.writeFile(destinationPath, data);
    await workspaceFileSystem.deletePath(sourcePath);
  } catch (error) {
    return createShellError(
      commandText,
      'mv',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }
  return createShellResult(commandText, {
    stdout: destinationPath,
    currentWorkingDirectory,
  });
}

async function runRm(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'rm',
      'expected at least one path.',
      2,
      currentWorkingDirectory
    );
  }
  let recursive = false;
  let force = false;
  const paths = [];
  for (const argument of args) {
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'r' || flag === 'R') {
          recursive = true;
          continue;
        }
        if (flag === 'f') {
          force = true;
          continue;
        }
        return createShellError(
          commandText,
          'rm',
          `unsupported option -${flag}.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    paths.push(argument);
  }
  if (!paths.length) {
    return createShellError(
      commandText,
      'rm',
      'expected at least one path.',
      2,
      currentWorkingDirectory
    );
  }
  for (const rawPath of paths) {
    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
    } catch (error) {
      return createShellError(
        commandText,
        'rm',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      if (force) {
        continue;
      }
      return createShellError(
        commandText,
        'rm',
        `cannot remove '${rawPath}': No such file or directory.`,
        1,
        currentWorkingDirectory
      );
    }
    if (stat.kind === 'directory' && !recursive) {
      return createShellError(
        commandText,
        'rm',
        `cannot remove '${rawPath}': Is a directory.`,
        1,
        currentWorkingDirectory
      );
    }
    try {
      await workspaceFileSystem.deletePath(normalizedPath, { recursive });
    } catch (error) {
      return createShellError(
        commandText,
        'rm',
        `cannot remove '${rawPath}': ${error instanceof Error ? error.message : String(error)}`,
        1,
        currentWorkingDirectory
      );
    }
  }
  return createShellResult(commandText, { currentWorkingDirectory });
}

async function runFind(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  let searchPath = currentWorkingDirectory;
  let namePattern = null;
  let entryType = null;
  let maxDepth = Number.POSITIVE_INFINITY;
  let minDepth = 0;
  let seenExplicitPath = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) {
      continue;
    }
    if (argument === '-name') {
      const value = args[index + 1];
      if (!value) {
        return createShellError(
          commandText,
          'find',
          'missing argument to `-name`.',
          1,
          currentWorkingDirectory
        );
      }
      namePattern = compileFindNamePattern(value);
      index += 1;
      continue;
    }
    if (argument === '-type') {
      const value = args[index + 1];
      if (value !== 'f' && value !== 'd') {
        return createShellError(
          commandText,
          'find',
          'argument to `-type` must be `f` or `d`.',
          1,
          currentWorkingDirectory
        );
      }
      entryType = value;
      index += 1;
      continue;
    }
    if (argument === '-maxdepth' || argument === '-mindepth') {
      const value = args[index + 1];
      const parsedValue = Number.parseInt(String(value || ''), 10);
      if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        return createShellError(
          commandText,
          'find',
          `argument to \`${argument}\` must be a non-negative integer.`,
          1,
          currentWorkingDirectory
        );
      }
      if (argument === '-maxdepth') {
        maxDepth = parsedValue;
      } else {
        minDepth = parsedValue;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      return createShellError(
        commandText,
        'find',
        `unknown predicate \`${argument}\`.`,
        1,
        currentWorkingDirectory
      );
    }
    if (seenExplicitPath) {
      return createShellError(
        commandText,
        'find',
        `unexpected path \`${argument}\`.`,
        1,
        currentWorkingDirectory
      );
    }
    searchPath = argument;
    seenExplicitPath = true;
  }

  if (minDepth > maxDepth) {
    return createShellError(
      commandText,
      'find',
      '`-mindepth` cannot be greater than `-maxdepth`.',
      1,
      currentWorkingDirectory
    );
  }

  let normalizedSearchPath;
  try {
    normalizedSearchPath = resolveWorkspacePath(
      workspaceFileSystem,
      searchPath,
      currentWorkingDirectory
    );
  } catch (error) {
    return createShellError(
      commandText,
      'find',
      error instanceof Error ? error.message : String(error),
      1,
      currentWorkingDirectory
    );
  }

  const rootStat = await safeStat(workspaceFileSystem, normalizedSearchPath);
  if (!rootStat) {
    return createShellError(
      commandText,
      'find',
      `\`${searchPath}\`: No such file or directory.`,
      1,
      currentWorkingDirectory
    );
  }

  const matches = [];
  await walkWorkspaceTree(workspaceFileSystem, normalizedSearchPath, async (entry, depth) => {
    if (depth > maxDepth) {
      return;
    }
    if (depth < minDepth) {
      return;
    }
    if (entryType === 'f' && entry.kind !== 'file') {
      return;
    }
    if (entryType === 'd' && entry.kind !== 'directory') {
      return;
    }
    if (namePattern && !namePattern.test(entry.name)) {
      return;
    }
    matches.push(entry.path);
  });

  return createShellResult(commandText, {
    stdout: matches.join('\n'),
    currentWorkingDirectory,
  });
}

async function runGrep(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  let ignoreCase = false;
  let showLineNumbers = false;
  let invertMatch = false;
  let countOnly = false;
  let listMatchingFiles = false;
  let fixedStrings = false;
  let onlyMatching = false;
  const positional = [];

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      for (const flag of argument.slice(1)) {
        if (flag === 'i') {
          ignoreCase = true;
          continue;
        }
        if (flag === 'n') {
          showLineNumbers = true;
          continue;
        }
        if (flag === 'v') {
          invertMatch = true;
          continue;
        }
        if (flag === 'c') {
          countOnly = true;
          continue;
        }
        if (flag === 'l') {
          listMatchingFiles = true;
          continue;
        }
        if (flag === 'F') {
          fixedStrings = true;
          continue;
        }
        if (flag === 'o') {
          onlyMatching = true;
          continue;
        }
        return createShellError(
          commandText,
          'grep',
          `invalid option -- '${flag}'.`,
          2,
          currentWorkingDirectory
        );
      }
      continue;
    }
    positional.push(argument);
  }

  if (positional.length < 1 || (positional.length < 2 && !hasPipelineStdin(stdinText))) {
    return createShellError(
      commandText,
      'grep',
      'expected a pattern and at least one file path.',
      2,
      currentWorkingDirectory
    );
  }
  if (onlyMatching && invertMatch) {
    return createShellError(
      commandText,
      'grep',
      'the -o and -v options cannot be combined in this subset.',
      2,
      currentWorkingDirectory
    );
  }

  const [rawPattern, ...rawPaths] = positional;
  let matcher;
  try {
    matcher = compileGrepPattern(rawPattern, {
      ignoreCase,
      fixedStrings,
    });
  } catch (error) {
    return createShellError(
      commandText,
      'grep',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }

  const multipleFiles = rawPaths.length > 1;
  const outputs = [];
  const targets = rawPaths.length
    ? rawPaths.map((rawPath) => ({ rawPath, stdin: false }))
    : [{ rawPath: '', stdin: true }];

  for (const target of targets) {
    const fileResult = target.stdin
      ? {
          path: '',
          text: String(stdinText ?? ''),
        }
      : await readWorkspaceTextFile(
          'grep',
          commandText,
          target.rawPath,
          workspaceFileSystem,
          currentWorkingDirectory
        );
    if (fileResult.error) {
      return fileResult.error;
    }

    const normalizedPath = fileResult.path;
    const lines = String(fileResult.text).split(/\r?\n/);
    if (/\r?\n$/.test(String(fileResult.text))) {
      lines.pop();
    }

    const matchingLines = [];
    let matchCount = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isMatch = matcher.test(line);
      const includeLine = invertMatch ? !isMatch : isMatch;
      if (!includeLine) {
        continue;
      }
      matchCount += 1;
      if (!countOnly && !listMatchingFiles) {
        const prefixes = [];
        if (multipleFiles) {
          prefixes.push(normalizedPath);
        }
        if (showLineNumbers) {
          prefixes.push(String(index + 1));
        }
        if (onlyMatching) {
          const matches = matcher.getMatches(line);
          matchingLines.push(
            ...matches.map((matchText) =>
              prefixes.length ? `${prefixes.join(':')}:${matchText}` : matchText
            )
          );
          continue;
        }
        matchingLines.push(prefixes.length ? `${prefixes.join(':')}:${line}` : line);
      }
    }

    if (listMatchingFiles) {
      if (matchCount > 0 && normalizedPath) {
        outputs.push(normalizedPath);
      }
      continue;
    }

    if (countOnly) {
      outputs.push(
        multipleFiles && normalizedPath ? `${normalizedPath}:${matchCount}` : String(matchCount)
      );
      continue;
    }

    outputs.push(...matchingLines);
  }

  return createShellResult(commandText, {
    stdout: outputs.join('\n'),
    currentWorkingDirectory,
  });
}

const SHELL_COMMAND_EXECUTORS = Object.freeze({
  pwd: ({ commandText, args, currentWorkingDirectory }) =>
    runPwd(commandText, args, currentWorkingDirectory),
  basename: ({ commandText, args, currentWorkingDirectory }) =>
    runBasename(commandText, args, currentWorkingDirectory),
  dirname: ({ commandText, args, currentWorkingDirectory }) =>
    runDirname(commandText, args, currentWorkingDirectory),
  printf: ({ commandText, args, currentWorkingDirectory }) =>
    runPrintf(commandText, args, currentWorkingDirectory),
  true: ({ commandText, args, currentWorkingDirectory }) =>
    runTrue(commandText, args, currentWorkingDirectory),
  false: ({ commandText, args, currentWorkingDirectory }) =>
    runFalse(commandText, args, currentWorkingDirectory),
  cd: ({ commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory }) =>
    runCd(commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory),
  echo: ({ commandText, args, currentWorkingDirectory }) =>
    runEcho(commandText, args, currentWorkingDirectory),
  set: ({ commandText, args, runtimeContext, currentWorkingDirectory }) =>
    runSet(commandText, args, runtimeContext, currentWorkingDirectory),
  unset: ({ commandText, args, runtimeContext, currentWorkingDirectory }) =>
    runUnset(commandText, args, runtimeContext, currentWorkingDirectory),
  which: ({ commandText, args, currentWorkingDirectory }) =>
    runWhich(commandText, args, currentWorkingDirectory),
  ls: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runLs(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  cat: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runCat(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  head: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runHead(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  tail: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runTail(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  wc: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runWc(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  sort: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runSort(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  uniq: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runUniq(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  cut: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runCut(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  paste: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runPaste(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  join: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runJoin(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  column: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runColumn(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  tr: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runTr(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  nl: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runNl(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  rmdir: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runRmdir(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  mkdir: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runMkdir(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  mktemp: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runMktemp(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  touch: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runTouch(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  cp: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runCp(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  mv: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runMv(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  rm: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runRm(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  find: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runFind(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  grep: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runGrep(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  sed: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText }) =>
    runSed(commandText, args, workspaceFileSystem, currentWorkingDirectory, stdinText),
  file: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runFile(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  diff: ({ commandText, args, workspaceFileSystem, currentWorkingDirectory }) =>
    runDiff(commandText, args, workspaceFileSystem, currentWorkingDirectory),
  curl: ({ commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory }) =>
    runCurl(commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory),
  python: async ({
    commandText,
    args,
    workspaceFileSystem,
    runtimeContext,
    currentWorkingDirectory,
  }) => {
    const pythonToolModule = await import('./python-tool.js');
    return pythonToolModule.executePythonShellCommand(
      commandText,
      args,
      workspaceFileSystem,
      runtimeContext,
      currentWorkingDirectory
    );
  },
});

function getShellCommandExecutor(commandName) {
  return SHELL_COMMAND_EXECUTORS[commandName] || null;
}

async function runSed(
  commandText,
  args,
  workspaceFileSystem,
  currentWorkingDirectory,
  stdinText = null
) {
  if (!args.length) {
    return createShellError(
      commandText,
      'sed',
      'expected a script and one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let suppressDefaultOutput = false;
  let inPlace = false;
  const positional = [];

  for (const argument of args) {
    if (argument === '--') {
      continue;
    }
    if (argument === '-n') {
      suppressDefaultOutput = true;
      continue;
    }
    if (argument === '-i') {
      inPlace = true;
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'sed',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    positional.push(argument);
  }

  const useStdin = positional.length === 1 && hasPipelineStdin(stdinText);
  if (!useStdin && positional.length !== 2) {
    return createShellError(
      commandText,
      'sed',
      'expected exactly one script and one file path.',
      2,
      currentWorkingDirectory
    );
  }

  let parsedScript;
  try {
    parsedScript = parseSedScript(positional[0]);
  } catch (error) {
    return createShellError(
      commandText,
      'sed',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }

  if (inPlace && useStdin) {
    return createShellError(
      commandText,
      'sed',
      'cannot use -i when reading from pipeline input.',
      2,
      currentWorkingDirectory
    );
  }

  const fileResult = useStdin
    ? {
        path: '',
        text: String(stdinText ?? ''),
      }
    : await readWorkspaceTextFile(
        'sed',
        commandText,
        positional[1],
        workspaceFileSystem,
        currentWorkingDirectory
      );
  if (fileResult.error) {
    return fileResult.error;
  }

  const { lines, trailingNewline } = splitShellTextIntoLines(fileResult.text);
  const matchAddress = createSedAddressMatcher(parsedScript.address, lines.length);
  const outputLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineText = lines[index];
    const lineNumber = index + 1;
    const addressMatched = matchAddress(lineText, lineNumber);

    if (parsedScript.command.type === 'print') {
      if (addressMatched) {
        outputLines.push(lineText);
      } else if (!suppressDefaultOutput) {
        outputLines.push(lineText);
      }
      continue;
    }

    if (parsedScript.command.type === 'delete') {
      if (!addressMatched && !suppressDefaultOutput) {
        outputLines.push(lineText);
      }
      continue;
    }

    const nextLineText =
      parsedScript.command.type === 'substitute' && addressMatched
        ? executeSedSubstitute(lineText, parsedScript.command)
        : lineText;
    if (!suppressDefaultOutput) {
      outputLines.push(nextLineText);
    }
  }

  const outputText = outputLines.length ? joinShellLines(outputLines, trailingNewline) : '';
  if (inPlace) {
    await workspaceFileSystem.writeTextFile(fileResult.path, outputText);
    return createShellResult(commandText, {
      currentWorkingDirectory,
    });
  }

  return createShellResult(commandText, {
    stdout: outputText,
    currentWorkingDirectory,
  });
}

async function runFile(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(
      commandText,
      'file',
      'expected at least one path.',
      2,
      currentWorkingDirectory
    );
  }

  const outputs = [];
  for (const rawPath of args) {
    if (rawPath.startsWith('-') && rawPath !== '-') {
      return createShellError(
        commandText,
        'file',
        `unsupported option ${rawPath}.`,
        2,
        currentWorkingDirectory
      );
    }

    let normalizedPath;
    try {
      normalizedPath = resolveWorkspacePath(workspaceFileSystem, rawPath, currentWorkingDirectory);
    } catch (error) {
      return createShellError(
        commandText,
        'file',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }

    const stat = await safeStat(workspaceFileSystem, normalizedPath);
    if (!stat) {
      return createShellError(
        commandText,
        'file',
        `cannot open '${rawPath}': No such file or directory.`,
        1,
        currentWorkingDirectory
      );
    }

    if (stat.kind === 'directory') {
      outputs.push(`${normalizedPath}: directory`);
      continue;
    }

    const bytes = await workspaceFileSystem.readFile(normalizedPath);
    outputs.push(`${normalizedPath}: ${describeFileBytes(normalizedPath, bytes)}`);
  }

  return createShellResult(commandText, {
    stdout: outputs.join('\n'),
    currentWorkingDirectory,
  });
}

async function runDiff(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  const filePaths = [];

  for (const argument of args) {
    if (argument === '--' || argument === '-u' || argument === '--unified') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(
        commandText,
        'diff',
        `unsupported option ${argument}.`,
        2,
        currentWorkingDirectory
      );
    }
    filePaths.push(argument);
  }

  if (filePaths.length !== 2) {
    return createShellError(
      commandText,
      'diff',
      'expected exactly two file paths.',
      2,
      currentWorkingDirectory
    );
  }

  const leftFile = await readWorkspaceTextFile(
    'diff',
    commandText,
    filePaths[0],
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (leftFile.error) {
    return leftFile.error;
  }

  const rightFile = await readWorkspaceTextFile(
    'diff',
    commandText,
    filePaths[1],
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (rightFile.error) {
    return rightFile.error;
  }

  if (leftFile.text === rightFile.text) {
    return createShellResult(commandText, {
      currentWorkingDirectory,
    });
  }

  const leftLines = splitShellTextIntoLines(leftFile.text);
  const rightLines = splitShellTextIntoLines(rightFile.text);
  const operations = buildDiffLineOperations(leftLines.lines, rightLines.lines);

  let stdout = '';
  if (operations) {
    const hunks = buildUnifiedDiffHunks(operations);
    if (hunks.length) {
      stdout = formatUnifiedDiffOutput(leftFile.path, rightFile.path, hunks);
    }
  }

  if (!stdout) {
    const differsOnlyByTrailingNewline =
      leftLines.lines.length === rightLines.lines.length &&
      leftLines.lines.every((line, index) => line === rightLines.lines[index]) &&
      leftLines.trailingNewline !== rightLines.trailingNewline;

    stdout = differsOnlyByTrailingNewline
      ? `Files ${leftFile.path} and ${rightFile.path} differ in trailing newline at end of file.`
      : `Files ${leftFile.path} and ${rightFile.path} differ (emulated line diff omitted for this comparison).`;
  }

  return createShellResult(commandText, {
    exitCode: 1,
    stdout,
    currentWorkingDirectory,
  });
}

async function runCurl(
  commandText,
  args,
  workspaceFileSystem,
  runtimeContext,
  currentWorkingDirectory
) {
  let options;
  try {
    options = parseCurlArguments(args);
  } catch (error) {
    return createShellError(
      commandText,
      'curl',
      error instanceof Error ? error.message : String(error),
      2,
      currentWorkingDirectory
    );
  }

  const fetchRef = getFetchRef(runtimeContext);
  if (typeof fetchRef !== 'function') {
    return createShellError(
      commandText,
      'curl',
      'fetch is unavailable in this browser session.',
      1,
      currentWorkingDirectory
    );
  }

  const method =
    options.method ||
    (options.includeHeadersOnly ? 'HEAD' : options.body !== null ? 'POST' : 'GET');
  if ((method === 'GET' || method === 'HEAD') && options.body !== null) {
    return createShellError(
      commandText,
      'curl',
      `${method} requests cannot include -d in the browser fetch API.`,
      2,
      currentWorkingDirectory
    );
  }

  const requestHeaders = new globalThis.Headers();
  for (const [name, value] of options.headers) {
    requestHeaders.append(name, value);
  }

  let response;
  try {
    response = await fetchRef(options.url, {
      method,
      headers: requestHeaders,
      body: options.body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createShellError(
      commandText,
      'curl',
      `request failed: ${message}`,
      1,
      currentWorkingDirectory
    );
  }

  const headerOutput = [
    formatCurlStatusLine(response),
    ...formatCurlHeaderLines(response.headers),
  ].join('\n');
  if (options.includeHeadersOnly) {
    return createShellResult(commandText, {
      stdout: headerOutput,
      currentWorkingDirectory,
    });
  }

  let responseBytes;
  try {
    responseBytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return createShellError(
      commandText,
      'curl',
      `failed to read response body: ${error instanceof Error ? error.message : String(error)}`,
      1,
      currentWorkingDirectory
    );
  }

  if (options.outputPath) {
    let normalizedOutputPath;
    try {
      normalizedOutputPath = resolveWorkspacePath(
        workspaceFileSystem,
        options.outputPath,
        currentWorkingDirectory
      );
    } catch (error) {
      return createShellError(
        commandText,
        'curl',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }

    try {
      await workspaceFileSystem.writeFile(normalizedOutputPath, responseBytes);
    } catch (error) {
      return createShellError(
        commandText,
        'curl',
        `failed to write '${options.outputPath}': ${error instanceof Error ? error.message : String(error)}`,
        1,
        currentWorkingDirectory
      );
    }

    return createShellResult(commandText, {
      currentWorkingDirectory,
    });
  }

  return createShellResult(commandText, {
    stdout: getUtf8TextDecoder().decode(responseBytes),
    currentWorkingDirectory,
  });
}

function buildShellCommandUsageResult(currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  return {
    shellFlavor: SHELL_FLAVOR,
    currentWorkingDirectory,
    supportedCommands: SHELL_COMMANDS,
    examples: [
      'ls /workspace/<directory>',
      'which ls',
      'basename /workspace/file.txt',
      'dirname /workspace/file.txt',
      'printf "Hello %s\\n" world',
      'mktemp',
      'mktemp -d /workspace/tmpdir.XXXXXX',
      'sort /workspace/<file>',
      'uniq /workspace/<file>',
      'cut -d , -f 1,3 /workspace/<file>',
      'paste /workspace/<left-file> /workspace/<right-file>',
      'join -t , /workspace/<left-file> /workspace/<right-file>',
      'column -t -s , /workspace/<file>',
      'tr abc xyz /workspace/<file>',
      'nl /workspace/<file>',
      'cd <directory>',
      'cat /workspace/<file>',
      'NAME=value',
      'echo $PWD',
      'head -n 20 /workspace/<file>',
      'find /workspace -name "*.txt"',
      'grep -n "term" /workspace/<file>',
      'cat /workspace/<file> | grep "term" | wc -l',
      "sed -n '2,4p' /workspace/<file>",
      "sed -i 's/old/new/g' /workspace/<file>",
      'file /workspace/<file>',
      'diff -u /workspace/<left-file> /workspace/<right-file>',
      'curl https://example.com/data.txt',
      'curl -I https://example.com/data.txt',
      'curl -X POST -H "Content-Type: application/json" -d \'{"topic":"planets"}\' https://example.com/api',
      'curl -o /workspace/download.bin https://example.com/file.bin',
      'python /workspace/script.py',
      'python -c "print(2 + 2)"',
      'mkdir -p /workspace/<directory>',
      'cp /workspace/<source-file> /workspace/<destination-file>',
    ],
    limitations: [
      'One command or one text pipeline runs per tool call.',
      'Commands are GNU/Linux-like, but only the documented subset is implemented.',
      `Command text must be plain shell input, ${MAX_SHELL_COMMAND_LENGTH} characters or fewer, and free of control characters.`,
      'Relative paths resolve from the current working directory.',
      'Minimal variable support exists for $VAR, ${VAR}, NAME=value, set, and unset.',
      'Pipeline-safe commands: printf, echo, cat, head, tail, wc, sort, uniq, cut, tr, nl, grep, sed.',
      'Unsupported syntax: ;, &&, redirection, substitution, globbing.',
      'paste, join, column, file, diff, curl, and python are partial GNU/Linux-like subsets.',
      'Unsupported commands or syntax return stderr text and a non-zero exit code.',
    ],
    placeholders: [
      '<directory> means a directory path under /workspace.',
      '<file> means a file path under /workspace.',
      '<source-file> and <destination-file> are placeholder file paths under /workspace.',
      '<left-file> and <right-file> are placeholder text file paths under /workspace.',
    ],
  };
}

function sanitizeShellCommandText(command) {
  const normalizedCommand = typeof command === 'string' ? command.trim() : '';
  if (!normalizedCommand) {
    throw new Error('run_shell_command command must be a non-empty string.');
  }
  if (containsUnsupportedShellControlCharacters(normalizedCommand)) {
    throw new Error('run_shell_command command cannot contain control characters.');
  }
  if (normalizedCommand.length > MAX_SHELL_COMMAND_LENGTH) {
    throw new Error(
      `run_shell_command command must be ${MAX_SHELL_COMMAND_LENGTH} characters or fewer.`
    );
  }
  if (normalizedCommand.includes('```')) {
    throw new Error('run_shell_command command must be plain shell text, not a fenced code block.');
  }
  if (
    /^<tool_call>[\s\S]*<\/tool_call>$/i.test(normalizedCommand) ||
    /^<\|tool_call_start\|>[\s\S]*<\|tool_call_end\|>$/i.test(normalizedCommand)
  ) {
    throw new Error('run_shell_command command must be plain shell text, not a nested tool call.');
  }
  if (
    /^\{[\s\S]*\}$/.test(normalizedCommand) &&
    /"(name|arguments|parameters)"\s*:/.test(normalizedCommand)
  ) {
    throw new Error('run_shell_command command must be plain shell text, not a JSON tool call.');
  }
  return normalizedCommand;
}

function getValidatedShellToolArguments(argumentsValue = {}) {
  if (argumentsValue === undefined) {
    return {};
  }
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('run_shell_command arguments must be an object.');
  }
  const shellArguments = /** @type {{cmd?: unknown; command?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['cmd', 'command']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`run_shell_command does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  if (shellArguments.cmd !== undefined && shellArguments.command !== undefined) {
    throw new Error('run_shell_command accepts either cmd or command, not both.');
  }
  const commandValue =
    shellArguments.cmd !== undefined ? shellArguments.cmd : shellArguments.command;
  if (commandValue === undefined) {
    return {};
  }
  if (typeof commandValue !== 'string') {
    throw new Error('run_shell_command command must be a non-empty string.');
  }
  return {
    command: sanitizeShellCommandText(commandValue),
  };
}

function normalizeShellResultForCommand(result, commandText) {
  return {
    ...result,
    command: commandText,
  };
}

async function executeSingleShellCommand(
  commandText,
  tokens,
  workspaceFileSystem,
  runtimeContext,
  currentWorkingDirectory,
  { stdinText = null, pipelineMode = false } = {}
) {
  const assignmentMatch =
    tokens.length === 1 ? tokens[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) : null;
  if (assignmentMatch) {
    if (pipelineMode) {
      return createShellError(
        commandText,
        'shell',
        'variable assignment is not supported inside pipelines.',
        2,
        currentWorkingDirectory
      );
    }
    if (isReadonlyShellVariable(assignmentMatch[1])) {
      return createShellError(
        commandText,
        'shell',
        `cannot overwrite readonly variable '${assignmentMatch[1]}'.`,
        1,
        currentWorkingDirectory
      );
    }
    try {
      setShellVariable(
        runtimeContext,
        assignmentMatch[1],
        expandShellToken(assignmentMatch[2], runtimeContext, currentWorkingDirectory)
      );
    } catch (error) {
      return createShellError(
        commandText,
        'shell',
        error instanceof Error ? error.message : String(error),
        1,
        currentWorkingDirectory
      );
    }
    return createShellResult(commandText, {
      currentWorkingDirectory,
    });
  }

  const expandedTokens = expandShellTokens(tokens, runtimeContext, currentWorkingDirectory);
  if (expandedTokens.length > MAX_SHELL_TOKENS) {
    return createShellError(
      commandText,
      'shell',
      `command expands to too many tokens; limit is ${MAX_SHELL_TOKENS}.`,
      2,
      currentWorkingDirectory
    );
  }
  if (!expandedTokens.length) {
    return createShellError(
      commandText,
      'shell',
      'command is empty after expansion.',
      2,
      currentWorkingDirectory
    );
  }

  const [commandName, ...args] = expandedTokens;
  if (pipelineMode && !PIPELINE_SAFE_COMMAND_NAMES.has(commandName)) {
    return createShellError(
      commandText,
      commandName,
      'this command is not supported inside pipelines.',
      2,
      currentWorkingDirectory
    );
  }

  const executor = getShellCommandExecutor(commandName);
  if (!executor) {
    return createShellError(
      commandText,
      'shell',
      `command '${commandName}' is not available. Call run_shell_command with {} to inspect the supported subset.`,
      127,
      currentWorkingDirectory
    );
  }
  const result = executor({
    commandText,
    args,
    workspaceFileSystem,
    runtimeContext,
    currentWorkingDirectory,
    stdinText,
  });
  return await result;
}

async function executeShellPipeline(
  commandText,
  workspaceFileSystem,
  runtimeContext,
  currentWorkingDirectory,
  preSplitSegments = null
) {
  const segments = Array.isArray(preSplitSegments)
    ? preSplitSegments
    : splitShellPipelineSegments(commandText);

  let stdinText = null;
  let latestResult = createShellResult(commandText, {
    currentWorkingDirectory,
  });
  for (const segmentText of segments) {
    let tokens;
    try {
      tokens = tokenizeShellCommand(segmentText);
    } catch (error) {
      return createShellError(
        commandText,
        'shell',
        error instanceof Error ? error.message : String(error),
        2,
        currentWorkingDirectory
      );
    }
    if (!tokens.length) {
      return createShellError(
        commandText,
        'shell',
        'command is empty.',
        2,
        currentWorkingDirectory
      );
    }
    latestResult = await executeSingleShellCommand(
      segmentText,
      tokens,
      workspaceFileSystem,
      runtimeContext,
      currentWorkingDirectory,
      {
        stdinText,
        pipelineMode: true,
      }
    );
    if (latestResult.exitCode !== 0) {
      return normalizeShellResultForCommand(latestResult, commandText);
    }
    stdinText = latestResult.stdout;
  }
  return normalizeShellResultForCommand(latestResult, commandText);
}

export async function executeShellCommandTool(argumentsValue = {}, runtimeContext = {}) {
  const normalizedArguments = /** @type {{command?: string}} */ (
    getValidatedShellToolArguments(argumentsValue)
  );
  const currentWorkingDirectory = getCurrentWorkingDirectory(runtimeContext);
  if (!normalizedArguments.command) {
    return buildShellCommandUsageResult(currentWorkingDirectory);
  }

  const commandText = normalizedArguments.command;
  const workspaceFileSystem = runtimeContext?.workspaceFileSystem;
  if (!workspaceFileSystem) {
    const result = createShellError(
      commandText,
      'shell',
      'workspace filesystem is unavailable in this browser session.',
      1,
      currentWorkingDirectory
    );
    if (typeof runtimeContext?.onShellCommandComplete === 'function') {
      runtimeContext.onShellCommandComplete(result);
    }
    return result;
  }

  const hasPipeline = commandText.includes('|');
  if (hasUnsupportedShellSyntax(commandText, { allowPipes: hasPipeline })) {
    return createRetryableShellError(
      commandText,
      'shell',
      hasPipeline
        ? 'redirection, command chaining, and substitutions are not supported in this subset.'
        : 'pipelines, redirection, command chaining, and substitutions are not supported in this subset.',
      'The shell command could not be parsed in this shell subset. Please try again with a single supported command.',
      2,
      currentWorkingDirectory
    );
  }

  let preparedTokens = null;
  let preparedSegments = null;
  if (hasPipeline) {
    try {
      preparedSegments = splitShellPipelineSegments(commandText);
    } catch (error) {
      return createRetryableShellError(
        commandText,
        'shell',
        error instanceof Error ? error.message : String(error),
        'The shell command could not be parsed. Please try again with balanced quotes and escapes.',
        2,
        currentWorkingDirectory
      );
    }
  } else {
    try {
      preparedTokens = tokenizeShellCommand(commandText);
    } catch (error) {
      return createRetryableShellError(
        commandText,
        'shell',
        error instanceof Error ? error.message : String(error),
        'The shell command could not be parsed. Please try again with balanced quotes and escapes.',
        2,
        currentWorkingDirectory
      );
    }
    if (!preparedTokens.length) {
      return createRetryableShellError(
        commandText,
        'shell',
        'command is empty.',
        'The shell command could not be parsed. Please try again with a non-empty supported command.',
        2,
        currentWorkingDirectory
      );
    }
  }

  if (typeof runtimeContext?.onShellCommandStart === 'function') {
    runtimeContext.onShellCommandStart({
      command: commandText,
      currentWorkingDirectory,
    });
  }

  const resolvedResult = hasPipeline
    ? await executeShellPipeline(
        commandText,
        workspaceFileSystem,
        runtimeContext,
        currentWorkingDirectory,
        preparedSegments
      )
    : await executeSingleShellCommand(
        commandText,
        preparedTokens,
        workspaceFileSystem,
        runtimeContext,
        currentWorkingDirectory
      );
  Object.defineProperty(resolvedResult, 'responseEnvelope', {
    value: buildShellToolResponseEnvelope(resolvedResult),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  if (typeof runtimeContext?.onShellCommandComplete === 'function') {
    runtimeContext.onShellCommandComplete(resolvedResult);
  }
  return resolvedResult;
}
