import {
  DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
  DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
  DEFAULT_PLAYBACK_RESUME_TAB_MODE,
  DEFAULT_REPEAT_PRESETS,
  sanitizePlaybackSettings,
} from "@/lib/playlistLoop";
import {
  isOwnerMetadata,
  isPlaybackContext,
  isPlaybackDebugEvent,
  isPlaybackSettings,
  isPlaylist,
  isVideoMetadata,
} from "@/lib/typeGuards";
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

type StorageSchemaEntry<K extends StorageKey> = {
  defaultValue: StorageDataByKey[K];
  normalize: (value: unknown) => StorageDataByKey[K];
  storageKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeArray<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function normalizeRecord<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): Record<string, T> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, T] => guard(entry[1])),
  );
}

export const STORAGE_SCHEMA: { [K in StorageKey]: StorageSchemaEntry<K> } = {
  playlists: {
    storageKey: "np_playlists",
    defaultValue: [],
    normalize: (value) => normalizeArray(value, isPlaylist),
  },
  playbackSettings: {
    storageKey: "np_repeat_settings",
    defaultValue: {
      playlistRepeatEnabled: false,
      resumeTabMode: DEFAULT_PLAYBACK_RESUME_TAB_MODE,
      activeRepeatPresetId: null,
      presets: DEFAULT_REPEAT_PRESETS,
      navigation: DEFAULT_PLAYBACK_NAVIGATION_SETTINGS,
      completion: DEFAULT_PLAYBACK_COMPLETION_SETTINGS,
    },
    normalize: (value) => sanitizePlaybackSettings(isPlaybackSettings(value) ? value : undefined),
  },
  playbackContexts: {
    storageKey: "np_playback_contexts",
    defaultValue: [],
    normalize: (value) => normalizeArray(value, isPlaybackContext),
  },
  playbackDebugEvents: {
    storageKey: "np_playback_debug_events",
    defaultValue: [],
    normalize: (value) => normalizeArray(value, isPlaybackDebugEvent),
  },
  lastActivePlaylistId: {
    storageKey: "np_last_active_playlist_id",
    defaultValue: null,
    normalize: (value) => (typeof value === "string" ? value : null),
  },
  videoMetadata: {
    storageKey: "np_video_metadata",
    defaultValue: {},
    normalize: (value) => normalizeRecord(value, isVideoMetadata),
  },
  owners: {
    storageKey: "np_owners",
    defaultValue: {},
    normalize: (value) => normalizeRecord(value, isOwnerMetadata),
  },
};

export const STORAGE_KEYS = Object.fromEntries(
  Object.entries(STORAGE_SCHEMA).map(([key, schema]) => [key, schema.storageKey]),
) as { [K in StorageKey]: (typeof STORAGE_SCHEMA)[K]["storageKey"] };

export function getDefaultStorageValue<K extends StorageKey>(key: K): StorageDataByKey[K] {
  const schema = STORAGE_SCHEMA[key] as StorageSchemaEntry<K>;
  return structuredClone(schema.defaultValue);
}

export function getDefaultStorageData(): StorageDataByKey {
  return Object.fromEntries(
    (Object.keys(STORAGE_SCHEMA) as StorageKey[]).map((key) => [key, getDefaultStorageValue(key)]),
  ) as unknown as StorageDataByKey;
}

export function normalizeStorageValue<K extends StorageKey>(
  key: K,
  value: unknown,
): StorageDataByKey[K] {
  const schema = STORAGE_SCHEMA[key] as StorageSchemaEntry<K>;
  return schema.normalize(value);
}

export function normalizeStorageData(
  value: unknown,
  options?: {
    includePlaybackDebugEvents?: boolean;
  },
): StorageDataByKey {
  const candidate =
    isRecord(value) && isRecord(value.data) ? value.data : isRecord(value) ? value : {};
  const normalized = Object.fromEntries(
    (Object.keys(STORAGE_SCHEMA) as StorageKey[]).map((key) => [
      key,
      normalizeStorageValue(key, candidate[key]),
    ]),
  ) as unknown as StorageDataByKey;
  const playlistIds = new Set(normalized.playlists.map((playlist) => playlist.id));
  const playlistById = new Map(normalized.playlists.map((playlist) => [playlist.id, playlist]));

  return {
    ...normalized,
    playbackContexts: normalized.playbackContexts.filter((playbackContext) => {
      const playlist = playlistById.get(playbackContext.playlistId);
      return (
        playlist !== undefined &&
        playbackContext.currentIndex >= 0 &&
        playbackContext.currentIndex < playlist.videoIds.length
      );
    }),
    playbackDebugEvents: options?.includePlaybackDebugEvents ? normalized.playbackDebugEvents : [],
    lastActivePlaylistId:
      normalized.lastActivePlaylistId && playlistIds.has(normalized.lastActivePlaylistId)
        ? normalized.lastActivePlaylistId
        : null,
  };
}
