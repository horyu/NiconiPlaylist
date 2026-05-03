import { browser } from "wxt/browser";

import { getStorageData } from "@/background/services/storage";
import { isOwnerMetadata, isPlaybackContext, isPlaylist, isVideoMetadata } from "@/lib/typeGuards";
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
