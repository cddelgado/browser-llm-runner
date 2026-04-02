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
    name: 'cd',
    usage: 'cd [<directory>]',
    description: 'Change the current working directory.',
  },
  {
    name: 'ls',
    usage: 'ls [-l] [<path>]',
    description: 'List files or directories under /workspace.',
  },
  {
    name: 'cat',
    usage: 'cat <file>',
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
    name: 'echo',
    usage: 'echo <text>',
    description: 'Print text to stdout.',
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

function tokenizeShellCommand(command) {
  const text = toShellText(command).trim();
  const tokens = [];
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

function formatLsEntry(entry) {
  if (entry.kind === 'directory') {
    return `d ${entry.name}`;
  }
  const size = Number.isFinite(entry.size) ? entry.size : 0;
  return `- ${String(size).padStart(8, ' ')} ${entry.name}`;
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

async function runLs(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  const paths = [];
  let longFormat = false;

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
        if (flag === 'a' || flag === '1') {
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
    if (stat.kind === 'directory') {
      const entries = await workspaceFileSystem.listDirectory(normalizedPath);
      const lines = longFormat ? entries.map(formatLsEntry) : entries.map((entry) => entry.name);
      section = lines.join('\n');
    } else {
      section = longFormat ? formatLsEntry(stat) : basename(normalizedPath);
    }

    if (targetPaths.length > 1) {
      outputs.push(`${normalizedPath}:\n${section}`.trimEnd());
    } else {
      outputs.push(section);
    }
  }

  return createShellResult(commandText, {
    stdout: outputs.filter(Boolean).join('\n\n'),
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

async function runCat(commandText, args, workspaceFileSystem, currentWorkingDirectory) {
  if (!args.length) {
    return createShellError(commandText, 'cat', 'expected at least one file path.', 2, currentWorkingDirectory);
  }
  const chunks = [];
  for (const rawPath of args) {
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
  return createShellResult(commandText, {
    stdout: chunks.join(''),
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

function buildShellCommandUsageResult(currentWorkingDirectory = WORKSPACE_ROOT_PATH) {
  return {
    shellFlavor: SHELL_FLAVOR,
    currentWorkingDirectory,
    supportedCommands: SHELL_COMMANDS,
    examples: [
      'ls /workspace/<directory>',
      'cd <directory>',
      'cat /workspace/<file>',
      'head -n 20 /workspace/<file>',
      'mkdir -p /workspace/<directory>',
      'cp /workspace/<source-file> /workspace/<destination-file>',
    ],
    limitations: [
      'Only one command runs per tool call.',
      'Commands are GNU/Linux-like, but only the documented subset is implemented.',
      'Relative paths resolve from the current working directory.',
      'Pipes, redirection, globbing, environment variables, and command substitution are not supported.',
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

  const [commandName, ...args] = tokens;
  if (commandName === 'pwd') {
    return runPwd(commandText, args, currentWorkingDirectory);
  }
  if (commandName === 'cd') {
    return runCd(commandText, args, workspaceFileSystem, runtimeContext, currentWorkingDirectory);
  }
  if (commandName === 'echo') {
    return runEcho(commandText, args, currentWorkingDirectory);
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

  return createShellError(
    commandText,
    'shell',
    `command '${commandName}' is not available. Call run_shell_command with {} to inspect the supported subset.`,
    127,
    currentWorkingDirectory
  );
}
