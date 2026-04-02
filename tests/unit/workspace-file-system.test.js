import { describe, expect, test } from 'vitest';
import {
  WORKSPACE_ROOT_PATH,
  createOpfsWorkspaceDriver,
  createWorkspaceFileSystem,
  normalizeWorkspacePath,
} from '../../src/workspace/workspace-file-system.js';

function createNamedError(name, message = name) {
  const error = new Error(message);
  error.name = name;
  return error;
}

class FakeFileHandle {
  constructor(name) {
    this.kind = 'file';
    this.name = name;
    this.bytes = new Uint8Array(0);
    this.lastModified = 0;
  }

  async createWritable() {
    return {
      write: async (data) => {
        if (typeof Blob === 'function' && data instanceof Blob) {
          this.bytes = new Uint8Array(await data.arrayBuffer());
        } else if (data instanceof Uint8Array) {
          this.bytes = new Uint8Array(data);
        } else {
          this.bytes = new Uint8Array(data || 0);
        }
        this.lastModified += 1;
      },
      close: async () => {},
    };
  }

  async getFile() {
    const bytes = this.bytes;
    return {
      size: bytes.byteLength,
      lastModified: this.lastModified,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }
}

class FakeDirectoryHandle {
  constructor(name) {
    this.kind = 'directory';
    this.name = name;
    this.children = new Map();
  }

  async getDirectoryHandle(name, { create = false } = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') {
        throw createNamedError('TypeMismatchError', `${name} is not a directory.`);
      }
      return existing;
    }
    if (!create) {
      throw createNamedError('NotFoundError', `${name} does not exist.`);
    }
    const directory = new FakeDirectoryHandle(name);
    this.children.set(name, directory);
    return directory;
  }

  async getFileHandle(name, { create = false } = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') {
        throw createNamedError('TypeMismatchError', `${name} is not a file.`);
      }
      return existing;
    }
    if (!create) {
      throw createNamedError('NotFoundError', `${name} does not exist.`);
    }
    const file = new FakeFileHandle(name);
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name, { recursive = false } = {}) {
    const entry = this.children.get(name);
    if (!entry) {
      throw createNamedError('NotFoundError', `${name} does not exist.`);
    }
    if (entry.kind === 'directory' && entry.children.size > 0 && !recursive) {
      throw createNamedError('InvalidModificationError', `${name} is not empty.`);
    }
    this.children.delete(name);
  }

  async *entries() {
    for (const entry of this.children.entries()) {
      yield entry;
    }
  }
}

function createWorkspaceFileSystemHarness() {
  const root = new FakeDirectoryHandle('');
  const driver = createOpfsWorkspaceDriver({
    getRootDirectory: async () => /** @type {any} */ (root),
  });
  return createWorkspaceFileSystem({ driver });
}

function createUpload(name, text, type = 'text/plain') {
  const bytes = new globalThis.TextEncoder().encode(text);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(0),
  };
}

describe('workspace-file-system', () => {
  test('normalizes relative linux-style workspace paths and rejects traversal', () => {
    expect(normalizeWorkspacePath('notes.txt')).toBe('/workspace/notes.txt');
    expect(normalizeWorkspacePath('workspace/examples/demo.js')).toBe(
      '/workspace/examples/demo.js',
    );
    expect(normalizeWorkspacePath('/workspace')).toBe(WORKSPACE_ROOT_PATH);
    expect(() => normalizeWorkspacePath('../secrets.txt')).toThrow(
      'Workspace paths may not contain parent-directory segments.',
    );
  });

  test('stores uploads in OPFS under /workspace and resolves unique file names', async () => {
    const workspaceFileSystem = createWorkspaceFileSystemHarness();

    const firstUpload = await workspaceFileSystem.storeUploadedFile(
      createUpload('notes.txt', 'alpha'),
    );
    const secondUpload = await workspaceFileSystem.storeUploadedFile(
      createUpload('notes.txt', 'beta'),
    );

    expect(firstUpload.path).toBe('/workspace/notes.txt');
    expect(secondUpload.path).toBe('/workspace/notes-2.txt');
    await expect(workspaceFileSystem.readTextFile(firstUpload.path)).resolves.toBe('alpha');
    await expect(workspaceFileSystem.readTextFile(secondUpload.path)).resolves.toBe('beta');
    await expect(workspaceFileSystem.listDirectory('/workspace')).resolves.toEqual([
      expect.objectContaining({ path: '/workspace/notes-2.txt', kind: 'file' }),
      expect.objectContaining({ path: '/workspace/notes.txt', kind: 'file' }),
    ]);
  });

  test('supports direct file operations through the abstraction instead of raw handles', async () => {
    const workspaceFileSystem = createWorkspaceFileSystemHarness();

    await workspaceFileSystem.ensureDirectory('/workspace/projects');
    await workspaceFileSystem.writeTextFile('/workspace/projects/todo.md', '# Todo');

    await expect(workspaceFileSystem.exists('/workspace/projects/todo.md')).resolves.toBe(true);
    await expect(workspaceFileSystem.readTextFile('/workspace/projects/todo.md')).resolves.toBe(
      '# Todo',
    );
    await expect(workspaceFileSystem.stat('/workspace/projects')).resolves.toEqual(
      expect.objectContaining({ path: '/workspace/projects', kind: 'directory' }),
    );
  });
});
