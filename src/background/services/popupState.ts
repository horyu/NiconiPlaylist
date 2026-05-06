import { browser } from "wxt/browser";

import { getStorageData } from "@/background/services/storage";
import { sanitizeRepeatSettings } from "@/lib/playlistLoop";
import {
  isOwnerMetadata,
  isPlaybackContext,
  isPlaylist,
  isRepeatSettings,
  isVideoMetadata,
} from "@/lib/typeGuards";
import type { PlaybackContext, Playlist, PlaylistId, RepeatSettings } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export type PopupState = {
  activeTabId: number | null;
  activeTabUrl: string | null;
  ownersMap: Record<string, OwnerMetadata>;
  playbackContexts: PlaybackContext[];
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
  repeatSettings: RepeatSettings;
  videoMetadataMap: Record<string, VideoMetadata>;
};

async function getActiveTabInfo(): Promise<{
  activeTabId: number | null;
  activeTabUrl: string | null;
}> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return {
    activeTabId: typeof activeTab?.id === "number" ? activeTab.id : null,
    activeTabUrl: typeof activeTab?.url === "string" ? activeTab.url : null,
  };
}

export async function getPopupState(): Promise<PopupState> {
  const [activeTabInfo, storageData] = await Promise.all([
    getActiveTabInfo(),
    getStorageData([
      "playlists",
      "repeatSettings",
      "lastActivePlaylistId",
      "videoMetadata",
      "owners",
      "playbackContexts",
    ]),
  ]);

  return {
    activeTabId: activeTabInfo.activeTabId,
    activeTabUrl: activeTabInfo.activeTabUrl,
    ownersMap: Object.fromEntries(
      Object.entries(storageData.owners).filter((entry): entry is [string, OwnerMetadata] =>
        isOwnerMetadata(entry[1]),
      ),
    ),
    playbackContexts: storageData.playbackContexts.filter(isPlaybackContext),
    playlists: storageData.playlists.filter(isPlaylist),
    lastActivePlaylistId: storageData.lastActivePlaylistId,
    repeatSettings: isRepeatSettings(storageData.repeatSettings)
      ? sanitizeRepeatSettings(storageData.repeatSettings)
      : sanitizeRepeatSettings(undefined),
    videoMetadataMap: Object.fromEntries(
      Object.entries(storageData.videoMetadata).filter((entry): entry is [string, VideoMetadata] =>
        isVideoMetadata(entry[1]),
      ),
    ),
  };
}
