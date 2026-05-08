import { browser } from "wxt/browser";

import { sanitizePlaybackSettings } from "@/lib/playlistLoop";
import {
  isOwnerMetadata,
  isPlaybackContext,
  isPlaybackSettings,
  isPlaylist,
  isVideoMetadata,
} from "@/lib/typeGuards";

import {
  getDefaultStorageData,
  getRawStorageData,
  type StorageDataByKey,
  setStorageData,
} from "./storage";

const STORAGE_EXPORT_VERSION = 1;
const STORAGE_EXPORT_KEYS = [
  "playlists",
  "playbackSettings",
  "playbackContexts",
  "lastActivePlaylistId",
  "videoMetadata",
  "owners",
] as const;

type StorageExportPayload = {
  data: StorageDataByKey;
  exportedAt: string;
  version: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeStorageData(value: unknown): StorageDataByKey {
  const candidate = (() => {
    if (!isRecord(value)) {
      return {};
    }

    if (isRecord(value.data)) {
      return value.data;
    }

    return value;
  })();
  const defaultStorageData = getDefaultStorageData();
  const playlists = Array.isArray(candidate.playlists)
    ? candidate.playlists.filter(isPlaylist)
    : defaultStorageData.playlists;
  const playlistIds = new Set(playlists.map((playlist) => playlist.id));
  const playbackContexts = Array.isArray(candidate.playbackContexts)
    ? candidate.playbackContexts.filter(
        (playbackContext) =>
          isPlaybackContext(playbackContext) &&
          playlistIds.has(playbackContext.playlistId) &&
          playbackContext.currentIndex >= 0 &&
          playbackContext.currentIndex <
            (playlists.find((playlist) => playlist.id === playbackContext.playlistId)?.videoIds
              .length ?? 0),
      )
    : defaultStorageData.playbackContexts;
  const lastActivePlaylistId =
    typeof candidate.lastActivePlaylistId === "string" &&
    playlistIds.has(candidate.lastActivePlaylistId)
      ? candidate.lastActivePlaylistId
      : null;
  const playbackSettings = sanitizePlaybackSettings(
    isPlaybackSettings(candidate.playbackSettings) ? candidate.playbackSettings : undefined,
  );
  const videoMetadata = isRecord(candidate.videoMetadata)
    ? (Object.fromEntries(
        Object.entries(candidate.videoMetadata).filter(
          (entry): entry is [string, StorageDataByKey["videoMetadata"][string]] =>
            isVideoMetadata(entry[1]),
        ),
      ) as StorageDataByKey["videoMetadata"])
    : defaultStorageData.videoMetadata;
  const owners = isRecord(candidate.owners)
    ? (Object.fromEntries(
        Object.entries(candidate.owners).filter(
          (entry): entry is [string, StorageDataByKey["owners"][string]] =>
            isOwnerMetadata(entry[1]),
        ),
      ) as StorageDataByKey["owners"])
    : defaultStorageData.owners;

  return {
    playlists,
    playbackSettings,
    playbackContexts,
    lastActivePlaylistId,
    videoMetadata,
    owners,
  };
}

export async function exportStorageData(): Promise<StorageExportPayload> {
  const rawStorageData = await getRawStorageData(STORAGE_EXPORT_KEYS);

  return {
    data: normalizeStorageData(rawStorageData),
    exportedAt: new Date().toISOString(),
    version: STORAGE_EXPORT_VERSION,
  };
}

export async function importStorageData(payload: unknown): Promise<void> {
  const normalizedStorageData = normalizeStorageData(payload);

  await setStorageData(normalizedStorageData);
}

export async function clearAllStoredData(): Promise<void> {
  await setStorageData(getDefaultStorageData());
}

export async function cleanupOrphanedStoredData(): Promise<{
  removedOwnerCount: number;
  removedVideoMetadataCount: number;
}> {
  const currentStorageData = await getRawStorageData(["owners", "playlists", "videoMetadata"]);
  const playlists = normalizeStorageData({
    playlists: currentStorageData.playlists,
  }).playlists;
  const referencedVideoIds = new Set(playlists.flatMap((playlist) => playlist.videoIds));
  const currentVideoMetadata = normalizeStorageData({
    videoMetadata: currentStorageData.videoMetadata,
  }).videoMetadata;
  const nextVideoMetadata = Object.fromEntries(
    Object.entries(currentVideoMetadata).filter(([watchId]) => referencedVideoIds.has(watchId)),
  );
  const referencedOwnerIds = new Set(
    Object.values(nextVideoMetadata).flatMap((videoMetadata) =>
      videoMetadata.ownerId ? [videoMetadata.ownerId] : [],
    ),
  );
  const currentOwners = normalizeStorageData({
    owners: currentStorageData.owners,
  }).owners;
  const nextOwners = Object.fromEntries(
    Object.entries(currentOwners).filter(([ownerId]) => referencedOwnerIds.has(ownerId)),
  );

  await setStorageData({
    videoMetadata: nextVideoMetadata,
    owners: nextOwners,
  });

  return {
    removedOwnerCount: Object.keys(currentOwners).length - Object.keys(nextOwners).length,
    removedVideoMetadataCount:
      Object.keys(currentVideoMetadata).length - Object.keys(nextVideoMetadata).length,
  };
}

export async function getStorageUsageBytes(): Promise<number> {
  return browser.storage.local.getBytesInUse(null);
}
