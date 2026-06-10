import { browser } from "wxt/browser";

import { isWatchUrl } from "@/lib/nicovideoUrl";
import { sanitizePlaybackSettings } from "@/lib/playlistLoop";
import {
  isOwnerMetadata,
  isPlaybackContext,
  isPlaybackDebugEvent,
  isPlaybackSettings,
  isPlaylist,
  isVideoMetadata,
} from "@/lib/typeGuards";

import { clearStoredPlaybackContextsByPlaylistId } from "./playlistStore";
import {
  getDefaultStorageData,
  getStorageData,
  getRawStorageData,
  mutateStorage,
  type StorageDataByKey,
  setStorageData,
} from "./storage";

const STORAGE_EXPORT_VERSION = 1;
const STORAGE_EXPORT_KEYS = [
  "playlists",
  "playbackSettings",
  "playbackContexts",
  "playbackDebugEvents",
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

function normalizeStorageData(
  value: unknown,
  options?: {
    includePlaybackDebugEvents?: boolean;
  },
): StorageDataByKey {
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
  const playbackDebugEvents =
    options?.includePlaybackDebugEvents && Array.isArray(candidate.playbackDebugEvents)
      ? candidate.playbackDebugEvents.filter(isPlaybackDebugEvent)
      : defaultStorageData.playbackDebugEvents;
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
    playbackDebugEvents,
    lastActivePlaylistId,
    videoMetadata,
    owners,
  };
}

export async function exportStorageData(): Promise<StorageExportPayload> {
  const rawStorageData = await getRawStorageData(STORAGE_EXPORT_KEYS);

  return {
    data: normalizeStorageData(rawStorageData, { includePlaybackDebugEvents: true }),
    exportedAt: new Date().toISOString(),
    version: STORAGE_EXPORT_VERSION,
  };
}

export async function importStorageData(payload: unknown): Promise<void> {
  const normalizedStorageData = normalizeStorageData(payload);

  await setStorageData({
    ...normalizedStorageData,
    playbackDebugEvents: [],
  });
}

export async function clearAllStoredData(): Promise<void> {
  await setStorageData(getDefaultStorageData());
}

export async function cleanupOrphanedStoredData(): Promise<{
  removedOwnerCount: number;
  removedVideoMetadataCount: number;
}> {
  return mutateStorage(["owners", "playlists", "videoMetadata"], (currentStorageData) => {
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

    return {
      updates: {
        videoMetadata: nextVideoMetadata,
        owners: nextOwners,
      },
      result: {
        removedOwnerCount: Object.keys(currentOwners).length - Object.keys(nextOwners).length,
        removedVideoMetadataCount:
          Object.keys(currentVideoMetadata).length - Object.keys(nextVideoMetadata).length,
      },
    };
  });
}

type StalePlaybackCleanupCandidate = {
  playlistId: string;
  playlistTitle: string;
  lastPlayedAt: string;
};

async function resolveAlivePlaybackTabIds(
  playbackContexts: StorageDataByKey["playbackContexts"],
): Promise<Set<number>> {
  const settledTabs = await Promise.allSettled(
    playbackContexts.map(async (playbackContext) => {
      const tab = await browser.tabs.get(playbackContext.tabId);

      if (!isWatchUrl(tab.url)) {
        return null;
      }

      return playbackContext.tabId;
    }),
  );

  return new Set(
    settledTabs.flatMap((result) =>
      result.status === "fulfilled" && typeof result.value === "number" ? [result.value] : [],
    ),
  );
}

async function findStalePlaybackCleanupCandidates(
  olderThanDays: number,
): Promise<StalePlaybackCleanupCandidate[]> {
  const normalizedDays = Math.max(1, Math.trunc(olderThanDays));
  const [playlists, playbackContexts] = await Promise.all([
    getStorageData(["playlists"]).then((data) => data.playlists.filter(isPlaylist)),
    getStorageData(["playbackContexts"]).then((data) =>
      data.playbackContexts.filter(isPlaybackContext),
    ),
  ]);
  const aliveTabIds = await resolveAlivePlaybackTabIds(playbackContexts);
  const cutoffTime = Date.now() - normalizedDays * 24 * 60 * 60 * 1000;
  const stalePlaylistIds = new Set(
    playbackContexts
      .filter((playbackContext) => !aliveTabIds.has(playbackContext.tabId))
      .map((playbackContext) => playbackContext.playlistId),
  );

  return playlists
    .filter((playlist) => {
      if (!stalePlaylistIds.has(playlist.id) || !playlist.lastPlayedAt) {
        return false;
      }

      const lastPlayedTime = Date.parse(playlist.lastPlayedAt);

      return Number.isFinite(lastPlayedTime) && lastPlayedTime < cutoffTime;
    })
    .map((playlist) => ({
      playlistId: playlist.id,
      playlistTitle: playlist.title?.trim() || "(無題)",
      lastPlayedAt: playlist.lastPlayedAt!,
    }));
}

export async function previewStalePlaybackCleanup(olderThanDays: number): Promise<{
  candidates: StalePlaybackCleanupCandidate[];
}> {
  return {
    candidates: await findStalePlaybackCleanupCandidates(olderThanDays),
  };
}

export async function cleanupStalePlaybackContexts(olderThanDays: number): Promise<{
  removedPlaylistCount: number;
}> {
  const candidates = await findStalePlaybackCleanupCandidates(olderThanDays);

  if (candidates.length === 0) {
    return {
      removedPlaylistCount: 0,
    };
  }

  await Promise.all(
    candidates.map((candidate) =>
      clearStoredPlaybackContextsByPlaylistId(
        candidate.playlistId,
        `manual-stale-cleanup:${olderThanDays}d`,
      ),
    ),
  );

  return {
    removedPlaylistCount: candidates.length,
  };
}

export async function getStorageUsageBytes(): Promise<number> {
  return browser.storage.local.getBytesInUse(null);
}
