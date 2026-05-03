import { browser } from "wxt/browser";

import { getStorageData } from "@/background/services/storage";
import type { PlaybackContext, Playlist, PlaylistId } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export type PopupState = {
  activeTabId: number | null;
  ownersMap: Record<string, OwnerMetadata>;
  playbackContexts: PlaybackContext[];
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
  videoMetadataMap: Record<string, VideoMetadata>;
};

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Playlist>;

  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.videoIds) &&
    candidate.videoIds.every((videoId) => typeof videoId === "string") &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    (candidate.memo === undefined || typeof candidate.memo === "string")
  );
}

function isPlaybackContext(value: unknown): value is PlaybackContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PlaybackContext>;

  return (
    typeof candidate.playlistId === "string" &&
    typeof candidate.tabId === "number" &&
    Number.isInteger(candidate.tabId) &&
    typeof candidate.currentIndex === "number" &&
    Number.isInteger(candidate.currentIndex)
  );
}

function isVideoMetadata(value: unknown): value is VideoMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<VideoMetadata>;

  return (
    typeof candidate.watchId === "string" &&
    typeof candidate.title === "string" &&
    !!candidate.thumbnail &&
    typeof candidate.thumbnail === "object" &&
    (candidate.duration === null || typeof candidate.duration === "number") &&
    (candidate.ownerId === null ||
      candidate.ownerId === undefined ||
      typeof candidate.ownerId === "string") &&
    typeof candidate.fetchedAt === "string"
  );
}

function isOwnerMetadata(value: unknown): value is OwnerMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<OwnerMetadata>;

  return (
    typeof candidate.id === "string" &&
    (candidate.name === null ||
      candidate.name === undefined ||
      typeof candidate.name === "string") &&
    (candidate.type === null ||
      candidate.type === undefined ||
      typeof candidate.type === "string") &&
    (candidate.iconUrl === null ||
      candidate.iconUrl === undefined ||
      typeof candidate.iconUrl === "string") &&
    typeof candidate.fetchedAt === "string"
  );
}

async function getActiveTabId(): Promise<number | null> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return typeof activeTab?.id === "number" ? activeTab.id : null;
}

export async function getPopupState(): Promise<PopupState> {
  const [activeTabId, storageData] = await Promise.all([
    getActiveTabId(),
    getStorageData([
      "playlists",
      "lastActivePlaylistId",
      "videoMetadata",
      "owners",
      "playbackContexts",
    ]),
  ]);

  return {
    activeTabId,
    ownersMap: Object.fromEntries(
      Object.entries(storageData.owners).filter((entry): entry is [string, OwnerMetadata] =>
        isOwnerMetadata(entry[1]),
      ),
    ),
    playbackContexts: storageData.playbackContexts.filter(isPlaybackContext),
    playlists: storageData.playlists.filter(isPlaylist),
    lastActivePlaylistId: storageData.lastActivePlaylistId,
    videoMetadataMap: Object.fromEntries(
      Object.entries(storageData.videoMetadata).filter((entry): entry is [string, VideoMetadata] =>
        isVideoMetadata(entry[1]),
      ),
    ),
  };
}
