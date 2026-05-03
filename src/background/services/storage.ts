import { browser } from "wxt/browser";

import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { PlaybackContext, Playlist, PlaylistId } from "@/lib/types";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export interface StorageDataByKey {
  playlists: Playlist[];
  playbackContexts: PlaybackContext[];
  lastActivePlaylistId: PlaylistId | null;
  videoMetadata: Record<string, VideoMetadata>;
  owners: Record<OwnerId, OwnerMetadata>;
}

export type StorageKey = keyof StorageDataByKey;

const DEFAULT_BY_KEY: StorageDataByKey = {
  playlists: [],
  playbackContexts: [],
  lastActivePlaylistId: null,
  videoMetadata: {},
  owners: {},
};

function ensureStorageAvailable(): typeof browser.storage.local {
  const storage = browser?.storage?.local;

  if (!storage) {
    throw new Error("browser.storage.local is unavailable");
  }

  return storage;
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
    data[key] = (result[storageKey] ?? DEFAULT_BY_KEY[key]) as StorageDataByKey[K];
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
  const storage = ensureStorageAvailable();
  const storageUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    storageUpdates[STORAGE_KEYS[key as StorageKey]] = value;
  }

  await storage.set(storageUpdates);
}
