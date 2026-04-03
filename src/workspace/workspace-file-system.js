export const WORKSPACE_ROOT_NAME = 'workspace';
export const WORKSPACE_ROOT_PATH = `/${WORKSPACE_ROOT_NAME}`;
export const CONVERSATION_WORKSPACE_DIRECTORY_NAME = '.conversations';

function getTextEncoder() {
  if (typeof globalThis.TextEncoder !== 'function') {
    throw new Error('TextEncoder is not available in this browser.');
  }
  return new globalThis.TextEncoder();
}

function getTextDecoder(encoding = 'utf-8') {
  if (typeof globalThis.TextDecoder !== 'function') {
    throw new Error('TextDecoder is not available in this browser.');
  }
  return new globalThis.TextDecoder(encoding);
}

function isNotFoundError(error) {
  return error?.name === 'NotFoundError';
}

function buildPathFromSegments(segments) {
  return `/${segments.join('/')}`;
}

function getWorkspacePathSegments(path) {
  const normalizedPath = normalizeWorkspacePath(path);
  const segments = normalizedPath.split('/').filter(Boolean);
  return segments.slice(1);
}

function splitWorkspacePath(path) {
  const normalizedPath = normalizeWorkspacePath(path);
  if (normalizedPath === WORKSPACE_ROOT_PATH) {
    return {
      path: normalizedPath,
      parentPath: null,
      name: WORKSPACE_ROOT_NAME,
    };
  }
  const segments = getWorkspacePathSegments(normalizedPath);
  const name = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  return {
    path: normalizedPath,
    parentPath: parentSegments.length
      ? `${WORKSPACE_ROOT_PATH}/${parentSegments.join('/')}`
      : WORKSPACE_ROOT_PATH,
    name,
  };
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value === 'string') {
    return getTextEncoder().encode(value);
  }
  throw new Error('Workspace file data must be a string, ArrayBuffer, or Uint8Array.');
}

function splitRawFileName(filename) {
  const normalizedName = typeof filename === 'string' ? filename.trim() : '';
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return {
      stem: normalizedName,
      extension: '',
    };
  }
  return {
    stem: normalizedName.slice(0, lastDotIndex),
    extension: normalizedName.slice(lastDotIndex + 1),
  };
}

function slugifyUploadedFileSegment(value, fallback = 'upload') {
  const normalizedValue = typeof value === 'string' ? value : '';
  const withoutDiacritics = normalizedValue.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

export function sanitizeUploadedFilename(value, fallback = 'upload') {
  const { stem, extension } = splitRawFileName(value);
  const fallbackStem = slugifyUploadedFileSegment(fallback, 'upload');
  const sanitizedStem = slugifyUploadedFileSegment(stem, fallbackStem);
  const sanitizedExtension = slugifyUploadedFileSegment(extension, '');
  return sanitizedExtension ? `${sanitizedStem}.${sanitizedExtension}` : sanitizedStem;
}

function splitFileNameParts(filename) {
  const normalizedName = sanitizeUploadedFilename(filename);
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return {
      stem: normalizedName,
      extension: '',
    };
  }
  return {
    stem: normalizedName.slice(0, lastDotIndex),
    extension: normalizedName.slice(lastDotIndex),
  };
}

async function findAvailableWorkspacePath(exists, directoryPath, filename) {
  const normalizedDirectoryPath = normalizeWorkspacePath(directoryPath);
  const { stem, extension } = splitFileNameParts(filename);
  let candidateIndex = 0;
  while (candidateIndex < 10000) {
    const candidateName =
      candidateIndex === 0 ? `${stem}${extension}` : `${stem}-${candidateIndex + 1}${extension}`;
    const candidatePath =
      normalizedDirectoryPath === WORKSPACE_ROOT_PATH
        ? `${WORKSPACE_ROOT_PATH}/${candidateName}`
        : `${normalizedDirectoryPath}/${candidateName}`;
    if (!(await exists(candidatePath))) {
      return candidatePath;
    }
    candidateIndex += 1;
  }
  throw new Error('Unable to allocate a unique workspace path for the uploaded file.');
}

export function sanitizeWorkspaceEntryName(value, fallback = 'upload') {
  const normalizedValue = typeof value === 'string' ? value : '';
  const sanitized = normalizedValue
    .replace(/[\\/]+/g, '-')
    .replaceAll(/./g, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '');
  return sanitized || fallback;
}

export function normalizeWorkspacePath(path) {
  const rawPath = typeof path === 'string' ? path.trim() : '';
  if (!rawPath || rawPath === '.' || rawPath === './' || rawPath === '/') {
    return WORKSPACE_ROOT_PATH;
  }

  const slashNormalized = rawPath.replace(/\\/g, '/');
  const withAbsolutePrefix =
    slashNormalized.startsWith('/')
      ? slashNormalized
      : slashNormalized === WORKSPACE_ROOT_NAME || slashNormalized.startsWith(`${WORKSPACE_ROOT_NAME}/`)
        ? `/${slashNormalized}`
        : `${WORKSPACE_ROOT_PATH}/${slashNormalized.replace(/^\.\//, '')}`;

  const segments = withAbsolutePrefix.split('/').filter(Boolean);
  if (!segments.length || segments[0] !== WORKSPACE_ROOT_NAME) {
    throw new Error('Workspace paths must stay under /workspace.');
  }

  const normalizedSegments = [WORKSPACE_ROOT_NAME];
  for (const segment of segments.slice(1)) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      throw new Error('Workspace paths may not contain parent-directory segments.');
    }
    normalizedSegments.push(segment);
  }

  return buildPathFromSegments(normalizedSegments);
}

export function createOpfsWorkspaceDriver({
  getRootDirectory = async () => {
    if (typeof navigator === 'undefined' || typeof navigator?.storage?.getDirectory !== 'function') {
      throw new Error('Origin Private File System is not available in this browser.');
    }
    return navigator.storage.getDirectory();
  },
} = {}) {
  async function getWorkspaceDirectoryHandle(create = false) {
    const rootHandle = await getRootDirectory();
    return rootHandle.getDirectoryHandle(WORKSPACE_ROOT_NAME, { create });
  }

  async function getDirectoryHandle(path, { create = false } = {}) {
    const directoryPath = normalizeWorkspacePath(path);
    const segments = getWorkspacePathSegments(directoryPath);
    let directoryHandle = await getWorkspaceDirectoryHandle(create);
    for (const segment of segments) {
      directoryHandle = await directoryHandle.getDirectoryHandle(segment, { create });
    }
    return directoryHandle;
  }

  async function getFileHandle(path, { create = false } = {}) {
    const { parentPath, name, path: normalizedPath } = splitWorkspacePath(path);
    if (!parentPath || normalizedPath === WORKSPACE_ROOT_PATH) {
      throw new Error('Workspace root is a directory and cannot be opened as a file.');
    }
    const parentDirectoryHandle = await getDirectoryHandle(parentPath, { create });
    return parentDirectoryHandle.getFileHandle(name, { create });
  }

  async function readFileFromHandle(fileHandle, path) {
    const file = await fileHandle.getFile();
    return {
      path,
      kind: 'file',
      size: Number.isFinite(file.size) ? file.size : 0,
      lastModified: Number.isFinite(file.lastModified) ? file.lastModified : undefined,
    };
  }

  return {
    kind: 'opfs',
    isNotFoundError,
    async ensureDirectory(path) {
      await getDirectoryHandle(path, { create: true });
      return {
        path: normalizeWorkspacePath(path),
        kind: 'directory',
      };
    },
    async writeFile(path, data) {
      const normalizedPath = normalizeWorkspacePath(path);
      const fileHandle = await getFileHandle(normalizedPath, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        const bytes = toUint8Array(data);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        await writable.write(new Blob([copy.buffer]));
      } finally {
        await writable.close();
      }
      return this.stat(normalizedPath);
    },
    async readFile(path) {
      const normalizedPath = normalizeWorkspacePath(path);
      const fileHandle = await getFileHandle(normalizedPath);
      const file = await fileHandle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
    async listDirectory(path = WORKSPACE_ROOT_PATH) {
      const normalizedPath = normalizeWorkspacePath(path);
      let directoryHandle;
      try {
        directoryHandle = await getDirectoryHandle(normalizedPath);
      } catch (error) {
        if (normalizedPath === WORKSPACE_ROOT_PATH && isNotFoundError(error)) {
          return [];
        }
        throw error;
      }
      const entries = [];
      for await (const [name, handle] of /** @type {any} */ (directoryHandle).entries()) {
        const entryPath =
          normalizedPath === WORKSPACE_ROOT_PATH
            ? `${WORKSPACE_ROOT_PATH}/${name}`
            : `${normalizedPath}/${name}`;
        if (handle.kind === 'directory') {
          entries.push({
            path: entryPath,
            name,
            kind: 'directory',
          });
          continue;
        }
        const file = await handle.getFile();
        entries.push({
          path: entryPath,
          name,
          kind: 'file',
          size: Number.isFinite(file.size) ? file.size : 0,
          lastModified: Number.isFinite(file.lastModified) ? file.lastModified : undefined,
        });
      }
      return entries.sort((left, right) => left.path.localeCompare(right.path));
    },
    async stat(path) {
      const normalizedPath = normalizeWorkspacePath(path);
      if (normalizedPath === WORKSPACE_ROOT_PATH) {
        return {
          path: WORKSPACE_ROOT_PATH,
          name: WORKSPACE_ROOT_NAME,
          kind: 'directory',
        };
      }

      try {
        const fileHandle = await getFileHandle(normalizedPath);
        return readFileFromHandle(fileHandle, normalizedPath);
      } catch (error) {
        if (!isNotFoundError(error) && error?.name !== 'TypeMismatchError') {
          throw error;
        }
      }

      const { name } = splitWorkspacePath(normalizedPath);
      await getDirectoryHandle(normalizedPath);
      return {
        path: normalizedPath,
        name,
        kind: 'directory',
      };
    },
    async deletePath(path, { recursive = false } = {}) {
      const { parentPath, name, path: normalizedPath } = splitWorkspacePath(path);
      if (normalizedPath === WORKSPACE_ROOT_PATH) {
        throw new Error('Deleting /workspace is not allowed.');
      }
      if (!parentPath) {
        throw new Error('A parent directory is required to delete this workspace path.');
      }
      const parentDirectoryHandle = await getDirectoryHandle(parentPath);
      await parentDirectoryHandle.removeEntry(name, { recursive: recursive === true });
      return true;
    },
  };
}

export function createWorkspaceFileSystem({ driver = createOpfsWorkspaceDriver() } = {}) {
  async function exists(path) {
    const normalizedPath = normalizeWorkspacePath(path);
    try {
      await driver.stat(normalizedPath);
      return true;
    } catch (error) {
      if (typeof driver.isNotFoundError === 'function' && driver.isNotFoundError(error)) {
        return false;
      }
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  return {
    backendKind: typeof driver.kind === 'string' ? driver.kind : 'unknown',
    rootPath: WORKSPACE_ROOT_PATH,
    normalizePath(path) {
      return normalizeWorkspacePath(path);
    },
    async ensureDirectory(path = WORKSPACE_ROOT_PATH) {
      const normalizedPath = normalizeWorkspacePath(path);
      await driver.ensureDirectory(normalizedPath);
      return {
        path: normalizedPath,
        kind: 'directory',
      };
    },
    async writeFile(path, data) {
      const normalizedPath = normalizeWorkspacePath(path);
      await driver.writeFile(normalizedPath, data);
      return driver.stat(normalizedPath);
    },
    async writeTextFile(path, text) {
      return this.writeFile(path, getTextEncoder().encode(String(text || '')));
    },
    async readFile(path) {
      return driver.readFile(normalizeWorkspacePath(path));
    },
    async readTextFile(path, { encoding = 'utf-8' } = {}) {
      const bytes = await driver.readFile(normalizeWorkspacePath(path));
      return getTextDecoder(encoding).decode(bytes);
    },
    async listDirectory(path = WORKSPACE_ROOT_PATH) {
      return driver.listDirectory(normalizeWorkspacePath(path));
    },
    async stat(path) {
      return driver.stat(normalizeWorkspacePath(path));
    },
    async exists(path) {
      return exists(path);
    },
    async deletePath(path, options) {
      return driver.deletePath(normalizeWorkspacePath(path), options);
    },
    async storeUploadedFile(file, options = {}) {
      if (!file || typeof file.arrayBuffer !== 'function') {
        throw new Error('A browser File is required to store an upload in the workspace.');
      }
      const {
        directoryPath = WORKSPACE_ROOT_PATH,
        preferredName,
        data,
      } = options;
      const normalizedDirectoryPath = normalizeWorkspacePath(directoryPath);
      await driver.ensureDirectory(normalizedDirectoryPath);
      const canonicalFilename = sanitizeUploadedFilename(preferredName || file.name || 'upload');
      const workspacePath = await findAvailableWorkspacePath(
        exists,
        normalizedDirectoryPath,
        canonicalFilename,
      );
      const bytes = toUint8Array(
        data === undefined ? new Uint8Array(await file.arrayBuffer()) : data,
      );
      await driver.writeFile(workspacePath, bytes);
      return {
        path: workspacePath,
        filename: splitWorkspacePath(workspacePath).name,
        size: Number.isFinite(file.size) ? file.size : bytes.byteLength,
        mimeType:
          typeof file.type === 'string' && file.type.trim()
            ? file.type.trim()
            : 'application/octet-stream',
      };
    },
  };
}

function mapVisiblePathToBackingPath(visiblePath, backingRootPath) {
  const normalizedVisiblePath = normalizeWorkspacePath(visiblePath);
  if (normalizedVisiblePath === WORKSPACE_ROOT_PATH) {
    return backingRootPath;
  }
  const relativePath = normalizedVisiblePath.slice(WORKSPACE_ROOT_PATH.length + 1);
  return `${backingRootPath}/${relativePath}`;
}

function mapBackingPathToVisiblePath(backingPath, backingRootPath) {
  const normalizedBackingPath = normalizeWorkspacePath(backingPath);
  if (normalizedBackingPath === backingRootPath) {
    return WORKSPACE_ROOT_PATH;
  }
  const relativePath = normalizedBackingPath.slice(backingRootPath.length + 1);
  return `${WORKSPACE_ROOT_PATH}/${relativePath}`;
}

function mapBackingStatToVisibleStat(stat, backingRootPath) {
  if (!stat || typeof stat !== 'object') {
    return stat;
  }
  return {
    ...stat,
    path: mapBackingPathToVisiblePath(stat.path, backingRootPath),
    name:
      stat.path === backingRootPath && stat.kind === 'directory'
        ? WORKSPACE_ROOT_NAME
        : stat.name,
  };
}

export function createConversationWorkspaceFileSystem(workspaceFileSystem, conversationId) {
  if (!workspaceFileSystem || typeof workspaceFileSystem !== 'object') {
    throw new Error('A workspace filesystem is required.');
  }
  const normalizedConversationId = sanitizeWorkspaceEntryName(conversationId, 'conversation');
  const backingRootPath = `${WORKSPACE_ROOT_PATH}/${CONVERSATION_WORKSPACE_DIRECTORY_NAME}/${normalizedConversationId}`;

  return {
    backendKind:
      typeof workspaceFileSystem.backendKind === 'string'
        ? workspaceFileSystem.backendKind
        : 'unknown',
    rootPath: WORKSPACE_ROOT_PATH,
    conversationId: normalizedConversationId,
    backingRootPath,
    normalizePath(path) {
      return normalizeWorkspacePath(path);
    },
    async ensureDirectory(path = WORKSPACE_ROOT_PATH) {
      const normalizedVisiblePath = normalizeWorkspacePath(path);
      await workspaceFileSystem.ensureDirectory(
        mapVisiblePathToBackingPath(normalizedVisiblePath, backingRootPath),
      );
      return {
        path: normalizedVisiblePath,
        kind: 'directory',
      };
    },
    async writeFile(path, data) {
      const normalizedVisiblePath = normalizeWorkspacePath(path);
      const stat = await workspaceFileSystem.writeFile(
        mapVisiblePathToBackingPath(normalizedVisiblePath, backingRootPath),
        data,
      );
      return mapBackingStatToVisibleStat(stat, backingRootPath);
    },
    async writeTextFile(path, text) {
      return this.writeFile(path, getTextEncoder().encode(String(text || '')));
    },
    async readFile(path) {
      return workspaceFileSystem.readFile(mapVisiblePathToBackingPath(path, backingRootPath));
    },
    async readTextFile(path, options) {
      return workspaceFileSystem.readTextFile(
        mapVisiblePathToBackingPath(path, backingRootPath),
        options,
      );
    },
    async listDirectory(path = WORKSPACE_ROOT_PATH) {
      const normalizedVisiblePath = normalizeWorkspacePath(path);
      const backingPath = mapVisiblePathToBackingPath(normalizedVisiblePath, backingRootPath);
      if (!(await workspaceFileSystem.exists(backingPath))) {
        return [];
      }
      const entries = await workspaceFileSystem.listDirectory(backingPath);
      return entries.map((entry) => mapBackingStatToVisibleStat(entry, backingRootPath));
    },
    async stat(path) {
      const normalizedVisiblePath = normalizeWorkspacePath(path);
      if (normalizedVisiblePath === WORKSPACE_ROOT_PATH) {
        return {
          path: WORKSPACE_ROOT_PATH,
          name: WORKSPACE_ROOT_NAME,
          kind: 'directory',
        };
      }
      const stat = await workspaceFileSystem.stat(
        mapVisiblePathToBackingPath(normalizedVisiblePath, backingRootPath),
      );
      return mapBackingStatToVisibleStat(stat, backingRootPath);
    },
    async exists(path) {
      return workspaceFileSystem.exists(mapVisiblePathToBackingPath(path, backingRootPath));
    },
    async deletePath(path, options) {
      const normalizedVisiblePath = normalizeWorkspacePath(path);
      if (normalizedVisiblePath === WORKSPACE_ROOT_PATH) {
        throw new Error('Deleting /workspace is not allowed.');
      }
      return workspaceFileSystem.deletePath(
        mapVisiblePathToBackingPath(normalizedVisiblePath, backingRootPath),
        options,
      );
    },
    async storeUploadedFile(file, options = {}) {
      const {
        directoryPath = WORKSPACE_ROOT_PATH,
        ...remainingOptions
      } = options;
      const storedFile = await workspaceFileSystem.storeUploadedFile(file, {
        ...remainingOptions,
        directoryPath: mapVisiblePathToBackingPath(directoryPath, backingRootPath),
      });
      return {
        ...storedFile,
        path: mapBackingPathToVisiblePath(storedFile.path, backingRootPath),
      };
    },
  };
}
