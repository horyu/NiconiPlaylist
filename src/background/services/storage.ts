import { browser } from "wxt/browser";

import {
  normalizeStorageValue,
  STORAGE_KEYS,
  type StorageDataByKey,
  type StorageKey,
} from "@/lib/storageSchema";

export type { StorageDataByKey, StorageKey } from "@/lib/storageSchema";

type StorageMutation<K extends StorageKey, R> = {
  updates: Partial<Pick<StorageDataByKey, K>>;
  result: R;
};

const STORAGE_MUTATION_LOCK_NAME = "niconiplaylist:storage-mutation";
// Web Locks coordinates mutations across extension pages and the background worker.
let localStorageMutationQueue = Promise.resolve();

export { getDefaultStorageData } from "@/lib/storageSchema";

function ensureStorageAvailable(): typeof browser.storage.local {
  const storage = browser?.storage?.local;

  if (!storage) {
    throw new Error("browser.storage.local is unavailable");
  }

  return storage;
}

function createStorageUpdates(updates: Partial<StorageDataByKey>): Record<string, unknown> {
  const storageUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    storageUpdates[STORAGE_KEYS[key as StorageKey]] = value;
  }

  return storageUpdates;
}

function runInLocalStorageMutationQueue<R>(callback: () => Promise<R>): Promise<R> {
  const previousMutation = localStorageMutationQueue;
  let resolveNextMutation: () => void = () => undefined;

  localStorageMutationQueue = new Promise<void>((resolve) => {
    resolveNextMutation = () => resolve();
  });

  return (async () => {
    await previousMutation.catch(() => undefined);

    try {
      return await callback();
    } finally {
      resolveNextMutation();
    }
  })();
}

function runWithStorageMutationLock<R>(callback: () => Promise<R>): Promise<R> {
  const lockManager = globalThis.navigator?.locks;

  if (lockManager) {
    return lockManager.request(STORAGE_MUTATION_LOCK_NAME, callback);
  }

  return runInLocalStorageMutationQueue(callback);
}

async function writeStorageData(updates: Partial<StorageDataByKey>): Promise<void> {
  const storageUpdates = createStorageUpdates(updates);

  if (Object.keys(storageUpdates).length === 0) {
    return;
  }

  await ensureStorageAvailable().set(storageUpdates);
}

export async function getStorageData<K extends StorageKey>(
  keys: readonly K[],
): Promise<Pick<StorageDataByKey, K>> {
  const storage = ensureStorageAvailable();
  const storageKeys = keys.map((key) => STORAGE_KEYS[key]);
  const result = await storage.get(storageKeys);
  const data = {} as Pick<StorageDataByKey, K>;

  for (const key of keys) {
    const storageKey = STORAGE_KEYS[key];
    data[key] = normalizeStorageValue(key, result[storageKey]);
  }

  return data;
}

export async function getRawStorageData<K extends StorageKey>(
  keys: readonly K[],
): Promise<Partial<Pick<StorageDataByKey, K>>> {
  const storage = ensureStorageAvailable();
  const storageKeys = keys.map((key) => STORAGE_KEYS[key]);
  const result = await storage.get(storageKeys);
  const data = {} as Partial<Pick<StorageDataByKey, K>>;

  for (const key of keys) {
    const storageKey = STORAGE_KEYS[key];
    const value = result[storageKey];

    if (value !== undefined) {
      data[key] = value as StorageDataByKey[K];
    }
  }

  return data;
}

export async function setStorageData(updates: Partial<StorageDataByKey>): Promise<void> {
  await runWithStorageMutationLock(() => writeStorageData(updates));
}

export async function mutateStorage<K extends StorageKey, R>(
  keys: readonly K[],
  updater: (data: Readonly<Pick<StorageDataByKey, K>>) => StorageMutation<K, R>,
): Promise<R> {
  return runWithStorageMutationLock(async () => {
    const data = await getStorageData(keys);
    const mutation = updater(data);

    await writeStorageData(mutation.updates);

    return mutation.result;
  });
}
