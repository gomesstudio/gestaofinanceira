/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

if (typeof window !== 'undefined' && window.origin !== 'null') {
  throw new Error(
    'Execução bloqueada: o sandbox de homologação P2.6B só pode iniciar em uma origem opaca (null) isolada por iframe sandbox.'
  );
}

const memoryStore = new Map<string, string>();
let simulateLocalStorageWriteFailure = false;

export function setSandboxLocalStorageWriteFailure(enabled: boolean): void {
  simulateLocalStorageWriteFailure = enabled;
}

const memoryLocalStorage: Storage = {
  get length() {
    return memoryStore.size;
  },
  clear() {
    memoryStore.clear();
  },
  getItem(key: string) {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  },
  key(index: number) {
    const keys = Array.from(memoryStore.keys());
    return keys[index] ?? null;
  },
  removeItem(key: string) {
    memoryStore.delete(key);
  },
  setItem(key: string, value: string) {
    if (simulateLocalStorageWriteFailure) {
      throw new DOMException('Simulated QuotaExceededError in sandbox', 'QuotaExceededError');
    }
    memoryStore.set(String(key), String(value));
  }
};

const memorySessionStore = new Map<string, string>();
const memorySessionStorage: Storage = {
  get length() {
    return memorySessionStore.size;
  },
  clear() {
    memorySessionStore.clear();
  },
  getItem(key: string) {
    return memorySessionStore.has(key) ? memorySessionStore.get(key)! : null;
  },
  key(index: number) {
    const keys = Array.from(memorySessionStore.keys());
    return keys[index] ?? null;
  },
  removeItem(key: string) {
    memorySessionStore.delete(key);
  },
  setItem(key: string, value: string) {
    memorySessionStore.set(String(key), String(value));
  }
};

const sandboxIdbFactory = new IDBFactory();

if (typeof globalThis !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryLocalStorage,
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memorySessionStorage,
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    value: sandboxIdbFactory,
    configurable: true,
    writable: true
  });
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    value: IDBKeyRange,
    configurable: true,
    writable: true
  });
}

export function getPreviewSandboxIdbFactory(): IDBFactory {
  return sandboxIdbFactory;
}
