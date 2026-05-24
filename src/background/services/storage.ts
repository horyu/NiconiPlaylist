import { browser } from "wxt/browser";

import {
  DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
  DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  DEFAULT_REPEAT_PRESETS,
} from "@/lib/playlistLoop";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type {
  PlaybackContext,
  PlaybackDebugEvent,
  PlaybackSettings,
  Playlist,
  PlaylistId,
} from "@/lib/types";
import type { OwnerId, OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export interface StorageDataByKey {
  playlists: Playlist[];
  playbackSettings: PlaybackSettings;
  playbackContexts: PlaybackContext[];
  playbackDebugEvents: PlaybackDebugEvent[];
  lastActivePlaylistId: PlaylistId | null;
  videoMetadata: Record<string, VideoMetadata>;
  owners: Record<OwnerId, OwnerMetadata>;
}

export type StorageKey = keyof StorageDataByKey;

const DEFAULT_BY_KEY: StorageDataByKey = {
  playlists: [],
  playbackSettings: {
    playlistRepeatEnabled: false,
    resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
    activeRepeatPresetId: null,
    presets: DEFAULT_REPEAT_PRESETS,
    navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
    completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  },
  playbackContexts: [],
  playbackDebugEvents: [],
  lastActivePlaylistId: null,
  videoMetadata: {},
  owners: {},
};

function cloneDefaultValue<K extends StorageKey>(key: K): StorageDataByKey[K] {
  return structuredClone(DEFAULT_BY_KEY[key]);
}

export function getDefaultStorageData(): StorageDataByKey {
  return {
    playlists: cloneDefaultValue("playlists"),
    playbackSettings: cloneDefaultValue("playbackSettings"),
    playbackContexts: cloneDefaultValue("playbackContexts"),
    playbackDebugEvents: cloneDefaultValue("playbackDebugEvents"),
    lastActivePlaylistId: cloneDefaultValue("lastActivePlaylistId"),
    videoMetadata: cloneDefaultValue("videoMetadata"),
    owners: cloneDefaultValue("owners"),
  };
}

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
    data[key] = (result[storageKey] ?? cloneDefaultValue(key)) as StorageDataByKey[K];
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
