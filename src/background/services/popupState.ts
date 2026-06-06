import { browser } from "wxt/browser";

import { getStorageData } from "@/background/services/storage";
import { isWatchUrl } from "@/lib/nicovideoUrl";
import { sanitizePlaybackSettings } from "@/lib/playlistLoop";
import type { PopupPendingPlaybackEndNavigationResponse } from "@/lib/popupMessages";
import {
  isPlaybackSettings,
  isOwnerMetadata,
  isPlaybackContext,
  isPlaylist,
  isVideoMetadata,
} from "@/lib/typeGuards";
import type { PlaybackContext, PlaybackSettings, Playlist, PlaylistId } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

export type PopupState = {
  activeTabId: number | null;
  activeTabUrl: string | null;
  alivePlaybackContexts: PlaybackContext[];
  ownersMap: Record<string, OwnerMetadata>;
  pendingPlaybackEndNavigationByPlaylistId: Partial<Record<PlaylistId, number>>;
  playbackContexts: PlaybackContext[];
  playbackSettings: PlaybackSettings;
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
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

async function resolveAlivePlaybackContexts(
  playbackContexts: PlaybackContext[],
): Promise<PlaybackContext[]> {
  const settledTabs = await Promise.allSettled(
    playbackContexts.map(async (playbackContext) => {
      const tab = await browser.tabs.get(playbackContext.tabId);

      if (!isWatchUrl(tab.url)) {
        return null;
      }

      return playbackContext;
    }),
  );

  return settledTabs.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}

export async function getPopupState(): Promise<PopupState> {
  const [activeTabInfo, storageData, pendingPlaybackEndNavigations] = await Promise.all([
    getActiveTabInfo(),
    getStorageData([
      "playlists",
      "playbackSettings",
      "lastActivePlaylistId",
      "videoMetadata",
      "owners",
      "playbackContexts",
    ]),
    browser.runtime.sendMessage({
      type: "popup:get-pending-playback-end-navigation",
    }) as Promise<PopupPendingPlaybackEndNavigationResponse | undefined>,
  ]);

  const playlists = storageData.playlists.filter(isPlaylist);
  const playbackContexts = storageData.playbackContexts.filter(isPlaybackContext);
  const alivePlaybackContexts = await resolveAlivePlaybackContexts(
    storageData.playbackContexts.filter(isPlaybackContext),
  );
  const visiblePlaylistIds = new Set(
    alivePlaybackContexts.map((playbackContext) => playbackContext.playlistId),
  );
  const pendingPlaybackEndNavigationByPlaylistId = alivePlaybackContexts.reduce<
    Partial<Record<PlaylistId, number>>
  >((result, playbackContext) => {
    if (result[playbackContext.playlistId] !== undefined) {
      return result;
    }

    const override = pendingPlaybackEndNavigations?.[playbackContext.tabId];

    if (!override || override.playlistId !== playbackContext.playlistId) {
      return result;
    }

    result[playbackContext.playlistId] = override.nextIndex;
    return result;
  }, {});
  const filteredPlaylists = playlists.filter(
    (playlist) =>
      !playlist.popupHidden ||
      playlist.id === storageData.lastActivePlaylistId ||
      visiblePlaylistIds.has(playlist.id),
  );

  return {
    activeTabId: activeTabInfo.activeTabId,
    activeTabUrl: activeTabInfo.activeTabUrl,
    alivePlaybackContexts,
    ownersMap: Object.fromEntries(
      Object.entries(storageData.owners).filter((entry): entry is [string, OwnerMetadata] =>
        isOwnerMetadata(entry[1]),
      ),
    ),
    pendingPlaybackEndNavigationByPlaylistId,
    playbackContexts,
    playbackSettings: isPlaybackSettings(storageData.playbackSettings)
      ? sanitizePlaybackSettings(storageData.playbackSettings)
      : sanitizePlaybackSettings(undefined),
    playlists: filteredPlaylists,
    lastActivePlaylistId: storageData.lastActivePlaylistId,
    videoMetadataMap: Object.fromEntries(
      Object.entries(storageData.videoMetadata).filter((entry): entry is [string, VideoMetadata] =>
        isVideoMetadata(entry[1]),
      ),
    ),
  };
}
