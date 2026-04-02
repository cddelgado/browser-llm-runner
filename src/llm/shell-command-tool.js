import {
  normalizeWorkspacePath,
  WORKSPACE_ROOT_PATH,
} from '../workspace/workspace-file-system.js';

const SHELL_FLAVOR = 'GNU/Linux-like shell subset';

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
    name: 'mkdir',
    usage: 'mkdir [-p] <directory>',
    description: 'Create directories under /workspace.',
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
    usage: 'grep [-i] [-n] [-v] [-c] [-l] [-F] <pattern> <file>...',
    description: 'Search text files under /workspace.',
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

function createShellResult(
  command,
  {
    exitCode = 0,
    stdout = '',
    stderr = '',
    currentWorkingDirectory = WORKSPACE_ROOT_PATH,
  } = {}
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
  const matches = toShellText(text).match(/\n/g);
  return matches ? matches.length : 0;
}

function basename(path) {
  const normalized = toShellText(path).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
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

function decodePrintfEscapes(text) {
  return String(text || '').replace(/\\([\\abfnrtv]|x[0-9A-Fa-f]{2}|0[0-7]{0,2}|.)/g, (match, escape) => {
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
  });
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
      current += character;
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

function hasUnsupportedShellSyntax(command) {
  const text = toShellText(command);
  return /(^|[^\\])(?:\||&&|\|\||;|`|>|<)|[\r\n]/.test(text) || text.includes('$(');
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
    return {
      test: (line) =>
        ignoreCase
          ? String(line || '').toLowerCase().includes(normalizedPattern.toLowerCase())
          : String(line || '').includes(normalizedPattern),
    };
  }
  return new RegExp(normalizedPattern, ignoreCase ? 'i' : '');
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
      ...(await listDirectoryRecursively(
        workspaceFileSystem,
        entry.path,
        options,
        seenDirectories
      ))
    );
  }

  return sections;
}

async function walkWorkspaceTree(
  workspaceFileSystem,
  rootPath,
  visit,
  depth = 0
) {
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

function getShellVariableValue(name, runtimeContext = {}, currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  if (name === 'PWD') {
    return currentWorkingDirectory;
  }
  if (name === 'WORKSPACE') {
    return WORKSPACE_ROOT_PATH;
  }
  const variables = getShellVariables(runtimeContext);
  return typeof variables[name] === 'string' ? variables[name] : '';
}

function setShellVariable(runtimeContext = {}, name, value) {
  const variables = getShellVariables(runtimeContext);
  variables[name] = String(value ?? '');
  return variables[name];
}

function unsetShellVariable(runtimeContext = {}, name) {
  const variables = getShellVariables(runtimeContext);
  delete variables[name];
}

function expandShellToken(token, runtimeContext = {}, currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  return String(token || '').replace(
    /\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})/g,
    (_match, shortName, bracedName) =>
      getShellVariableValue(shortName || bracedName, runtimeContext, currentWorkingDirectory),
  );
}

function expandShellTokens(tokens, runtimeContext = {}, currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  return Array.isArray(tokens)
    ? tokens.map((token) => expandShellToken(token, runtimeContext, currentWorkingDirectory))
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
  const seedPath = isAbsolute ? WORKSPACE_ROOT_PATH : workspaceFileSystem.normalizePath(currentWorkingDirectory);
  const seedSegments = seedPath.split('/').filter(Boolean);
  const candidateSegments = isAbsolute
    ? (slashNormalized.startsWith('/') ? slashNormalized : `/${slashNormalized}`).split('/').filter(Boolean)
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

function parseLineCountArguments(commandName, args) {
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

async function runCd(commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory) {
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
    const builtinVariables = [
      `PWD=${currentWorkingDirectory}`,
      `WORKSPACE=${WORKSPACE_ROOT_PATH}`,
    ];
    return createShellResult(commandText, {
      stdout: [...builtinVariables, ...userVariables].join('\n'),
      currentWorkingDirectory,
    });
  }

  const assignmentMatch = args.length === 1 ? args[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) : null;
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

  setShellVariable(runtimeContext, variableName, variableValue);
  return createShellResult(commandText, {
    currentWorkingDirectory,
  });
}

async function runUnset(commandText, args, runtimeContext, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'unset', 'expected at least one variable name.', 2, currentWorkingDirectory);
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
        return createShellError(commandText, 'ls', `unsupported option -${flag}.`, 2, currentWorkingDirectory);
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
        const sections = await listDirectoryRecursively(workspaceFileSystem, normalizedPath, listOptions);
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

function isBlankCatLine(line) {
  return line.trim() === '';
}

function formatCatText(text, { numberAllLines = false, numberNonBlankLines = false, squeezeBlank = false } = {}) {
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

async function runCat(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'cat', 'expected at least one file path.', 2, currentWorkingDirectory);
  }
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
      return createShellError(commandText, 'cat', `unrecognized option '${argument}'.`, 2, currentWorkingDirectory);
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
        return createShellError(commandText, 'cat', `invalid option -- '${flag}'.`, 2, currentWorkingDirectory);
      }
      continue;
    }
    filePaths.push(argument);
  }

  if (!filePaths.length) {
    return createShellError(commandText, 'cat', 'expected at least one file path.', 2, currentWorkingDirectory);
  }
  const chunks = [];
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

async function runHead(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('head', args);
  } catch (error) {
    return createShellError(commandText, 'head', error instanceof Error ? error.message : String(error), 2, currentWorkingDirectory);
  }
  const fileResult = await readWorkspaceTextFile(
    'head',
    commandText,
    parsedArguments.path,
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (fileResult.error) {
    return fileResult.error;
  }
  const lines = fileResult.text.split(/\r?\n/);
  return createShellResult(commandText, {
    stdout: lines.slice(0, parsedArguments.count).join('\n'),
    currentWorkingDirectory,
  });
}

async function runTail(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  let parsedArguments;
  try {
    parsedArguments = parseLineCountArguments('tail', args);
  } catch (error) {
    return createShellError(commandText, 'tail', error instanceof Error ? error.message : String(error), 2, currentWorkingDirectory);
  }
  const fileResult = await readWorkspaceTextFile(
    'tail',
    commandText,
    parsedArguments.path,
    workspaceFileSystem,
    currentWorkingDirectory
  );
  if (fileResult.error) {
    return fileResult.error;
  }
  const lines = fileResult.text.split(/\r?\n/);
  return createShellResult(commandText, {
    stdout: lines.slice(Math.max(0, lines.length - parsedArguments.count)).join('\n'),
    currentWorkingDirectory,
  });
}

async function runWc(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'wc', 'expected one file path.', 2, currentWorkingDirectory);
  }

  let mode = 'all';
  const remaining = [...args];
  if (remaining[0]?.startsWith('-')) {
    mode = remaining.shift();
  }
  if (remaining.length !== 1) {
    return createShellError(commandText, 'wc', 'expected one file path.', 2, currentWorkingDirectory);
  }

  const fileResult = await readWorkspaceTextFile(
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
  let stdout = '';

  if (mode === '-l') {
    stdout = `${lineCount} ${fileResult.path}`;
  } else if (mode === '-w') {
    stdout = `${wordCount} ${fileResult.path}`;
  } else if (mode === '-c') {
    stdout = `${byteCount} ${fileResult.path}`;
  } else if (mode === 'all') {
    stdout = `${lineCount} ${wordCount} ${byteCount} ${fileResult.path}`;
  } else {
    return createShellError(commandText, 'wc', `unsupported option ${mode}.`, 2, currentWorkingDirectory);
  }

  return createShellResult(commandText, { stdout, currentWorkingDirectory });
}

async function runMkdir(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'mkdir', 'expected at least one directory path.', 2, currentWorkingDirectory);
  }
  const directoryArgs = [];
  for (const argument of args) {
    if (argument === '-p') {
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') {
      return createShellError(commandText, 'mkdir', `unsupported option ${argument}.`, 2, currentWorkingDirectory);
    }
    directoryArgs.push(argument);
  }
  if (!directoryArgs.length) {
    return createShellError(commandText, 'mkdir', 'expected at least one directory path.', 2, currentWorkingDirectory);
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

async function runTouch(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'touch', 'expected at least one file path.', 2, currentWorkingDirectory);
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
      return createShellError(commandText, 'touch', `'${rawPath}' is a directory.`, 1, currentWorkingDirectory);
    }
    if (!stat) {
      await workspaceFileSystem.writeTextFile(normalizedPath, '');
    }
  }
  return createShellResult(commandText, { currentWorkingDirectory });
}

async function runCp(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (args.length !== 2) {
    return createShellError(commandText, 'cp', 'expected a source path and a destination path.', 2, currentWorkingDirectory);
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
    return createShellError(commandText, 'cp', `cannot stat '${args[0]}': No such file or directory.`, 1, currentWorkingDirectory);
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(commandText, 'cp', 'only file copies are supported in this subset.', 1, currentWorkingDirectory);
  }
  const destinationPath = await resolveOutputPath(
    workspaceFileSystem,
    args[1],
    sourcePath,
    currentWorkingDirectory
  );
  const data = await workspaceFileSystem.readFile(sourcePath);
  await workspaceFileSystem.writeFile(destinationPath, data);
  return createShellResult(commandText, {
    stdout: destinationPath,
    currentWorkingDirectory,
  });
}

async function runMv(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (args.length !== 2) {
    return createShellError(commandText, 'mv', 'expected a source path and a destination path.', 2, currentWorkingDirectory);
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
    return createShellError(commandText, 'mv', `cannot stat '${args[0]}': No such file or directory.`, 1, currentWorkingDirectory);
  }
  if (sourceStat.kind !== 'file') {
    return createShellError(commandText, 'mv', 'only file moves are supported in this subset.', 1, currentWorkingDirectory);
  }
  const destinationPath = await resolveOutputPath(
    workspaceFileSystem,
    args[1],
    sourcePath,
    currentWorkingDirectory
  );
  const data = await workspaceFileSystem.readFile(sourcePath);
  await workspaceFileSystem.writeFile(destinationPath, data);
  await workspaceFileSystem.deletePath(sourcePath);
  return createShellResult(commandText, {
    stdout: destinationPath,
    currentWorkingDirectory,
  });
}

async function runRm(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'rm', 'expected at least one path.', 2, currentWorkingDirectory);
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
        return createShellError(commandText, 'rm', `unsupported option -${flag}.`, 2, currentWorkingDirectory);
      }
      continue;
    }
    paths.push(argument);
  }
  if (!paths.length) {
    return createShellError(commandText, 'rm', 'expected at least one path.', 2, currentWorkingDirectory);
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
      return createShellError(commandText, 'rm', `cannot remove '${rawPath}': No such file or directory.`, 1, currentWorkingDirectory);
    }
    if (stat.kind === 'directory' && !recursive) {
      return createShellError(commandText, 'rm', `cannot remove '${rawPath}': Is a directory.`, 1, currentWorkingDirectory);
    }
    await workspaceFileSystem.deletePath(normalizedPath, { recursive });
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
        return createShellError(commandText, 'find', 'missing argument to `-name`.', 1, currentWorkingDirectory);
      }
      namePattern = compileFindNamePattern(value);
      index += 1;
      continue;
    }
    if (argument === '-type') {
      const value = args[index + 1];
      if (value !== 'f' && value !== 'd') {
        return createShellError(commandText, 'find', 'argument to `-type` must be `f` or `d`.', 1, currentWorkingDirectory);
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
      return createShellError(commandText, 'find', `unknown predicate \`${argument}\`.`, 1, currentWorkingDirectory);
    }
    if (seenExplicitPath) {
      return createShellError(commandText, 'find', `unexpected path \`${argument}\`.`, 1, currentWorkingDirectory);
    }
    searchPath = argument;
    seenExplicitPath = true;
  }

  if (minDepth > maxDepth) {
    return createShellError(commandText, 'find', '`-mindepth` cannot be greater than `-maxdepth`.', 1, currentWorkingDirectory);
  }

  let normalizedSearchPath;
  try {
    normalizedSearchPath = resolveWorkspacePath(workspaceFileSystem, searchPath, currentWorkingDirectory);
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

async function runGrep(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  let ignoreCase = false;
  let showLineNumbers = false;
  let invertMatch = false;
  let countOnly = false;
  let listMatchingFiles = false;
  let fixedStrings = false;
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
        return createShellError(commandText, 'grep', `invalid option -- '${flag}'.`, 2, currentWorkingDirectory);
      }
      continue;
    }
    positional.push(argument);
  }

  if (positional.length < 2) {
    return createShellError(
      commandText,
      'grep',
      'expected a pattern and at least one file path.',
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

  for (const rawPath of rawPaths) {
    const fileResult = await readWorkspaceTextFile(
      'grep',
      commandText,
      rawPath,
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
        matchingLines.push(prefixes.length ? `${prefixes.join(':')}:${line}` : line);
      }
    }

    if (listMatchingFiles) {
      if (matchCount > 0) {
        outputs.push(normalizedPath);
      }
      continue;
    }

    if (countOnly) {
      outputs.push(multipleFiles ? `${normalizedPath}:${matchCount}` : String(matchCount));
      continue;
    }

    outputs.push(...matchingLines);
  }

  return createShellResult(commandText, {
    stdout: outputs.join('\n'),
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
      'cd <directory>',
      'cat /workspace/<file>',
      'NAME=value',
      'echo $PWD',
      'head -n 20 /workspace/<file>',
      'find /workspace -name "*.txt"',
      'grep -n "term" /workspace/<file>',
      'mkdir -p /workspace/<directory>',
      'cp /workspace/<source-file> /workspace/<destination-file>',
    ],
    limitations: [
      'Only one command runs per tool call.',
      'Commands are GNU/Linux-like, but only the documented subset is implemented.',
      'Relative paths resolve from the current working directory.',
      'Minimal variable support exists for $VAR, ${VAR}, NAME=value, set, and unset.',
      'Pipes, redirection, globbing, command substitution, and full shell expansion semantics are not supported.',
      'Unsupported commands or syntax return stderr text and a non-zero exit code.',
    ],
    placeholders: [
      '<directory> means a directory path under /workspace.',
      '<file> means a file path under /workspace.',
      '<source-file> and <destination-file> are placeholder file paths under /workspace.',
    ],
  };
}

function getValidatedShellToolArguments(argumentsValue = {}) {
  if (argumentsValue === undefined) {
    return {};
  }
  if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) {
    throw new Error('run_shell_command arguments must be an object.');
  }
  const shellArguments = /** @type {{command?: unknown}} */ (argumentsValue);
  const supportedKeys = new Set(['command']);
  const unexpectedKeys = Object.keys(argumentsValue).filter((key) => !supportedKeys.has(key));
  if (unexpectedKeys.length) {
    throw new Error(`run_shell_command does not accept: ${unexpectedKeys.join(', ')}.`);
  }
  if (shellArguments.command === undefined) {
    return {};
  }
  if (typeof shellArguments.command !== 'string' || !shellArguments.command.trim()) {
    throw new Error('run_shell_command command must be a non-empty string.');
  }
  return {
    command: shellArguments.command.trim(),
  };
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
    return createShellError(
      commandText,
      'shell',
      'workspace filesystem is unavailable in this browser session.',
      1,
      currentWorkingDirectory
    );
  }

  if (hasUnsupportedShellSyntax(commandText)) {
    return createShellError(
      commandText,
      'shell',
      'pipelines, redirection, command chaining, and substitutions are not supported in this subset.',
      2,
      currentWorkingDirectory
    );
  }

  let tokens;
  try {
    tokens = tokenizeShellCommand(commandText);
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
    return createShellError(commandText, 'shell', 'command is empty.', 2, currentWorkingDirectory);
  }

  const assignmentMatch =
    tokens.length === 1 ? tokens[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/) : null;
  if (assignmentMatch) {
    if (isReadonlyShellVariable(assignmentMatch[1])) {
      return createShellError(
        commandText,
        'shell',
        `cannot overwrite readonly variable '${assignmentMatch[1]}'.`,
        1,
        currentWorkingDirectory
      );
    }
    setShellVariable(
      runtimeContext,
      assignmentMatch[1],
      expandShellToken(assignmentMatch[2], runtimeContext, currentWorkingDirectory)
    );
    return createShellResult(commandText, {
      currentWorkingDirectory,
    });
  }

  const expandedTokens = expandShellTokens(tokens, runtimeContext, currentWorkingDirectory);
  const [commandName, ...args] = expandedTokens;
  if (commandName === 'pwd') {
    return runPwd(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'basename') {
    return runBasename(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'dirname') {
    return runDirname(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'printf') {
    return runPrintf(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'true') {
    return runTrue(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'false') {
    return runFalse(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'cd') {
    return runCd(commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory);
  }
  if (commandName === 'echo') {
    return runEcho(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'set') {
    return runSet(commandText, args, runtimeContext, currentWorkingDirectory);
  }
  if (commandName === 'unset') {
    return runUnset(commandText, args, runtimeContext, currentWorkingDirectory);
  }
  if (commandName === 'which') {
    return runWhich(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'ls') {
    return runLs(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'cat') {
    return runCat(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'head') {
    return runHead(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'tail') {
    return runTail(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'wc') {
    return runWc(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'mkdir') {
    return runMkdir(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'touch') {
    return runTouch(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'cp') {
    return runCp(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'mv') {
    return runMv(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'rm') {
    return runRm(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'find') {
    return runFind(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }
  if (commandName === 'grep') {
    return runGrep(commandText, args, workspaceFileSystem, currentWorkingDirectory);
  }

  return createShellError(
    commandText,
    'shell',
    `command '${commandName}' is not available. Call run_shell_command with {} to inspect the supported subset.`,
    127,
    currentWorkingDirectory
  );
}
