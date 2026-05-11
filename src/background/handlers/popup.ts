import { browser } from "wxt/browser";

import { getStoredPlaybackSettings } from "@/background/services/playbackSettings";
import {
  getStoredPlaylists,
  setStoredPlaybackContextIndex,
} from "@/background/services/playlistStore";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import type { PopupMessage } from "@/lib/popupMessages";

async function handleStartPlayback(message: PopupMessage & { type: "popup:start-playback" }) {
  const [playlists, playbackSettings] = await Promise.all([
    getStoredPlaylists(),
    getStoredPlaybackSettings(),
  ]);
  const playlist = playlists.find((currentPlaylist) => currentPlaylist.id === message.playlistId);
  const nextVideoId = playlist?.videoIds[message.index];

  if (!playlist || !nextVideoId) {
    throw new Error("指定したプレイリストまたは動画が見つかりません。");
  }

  const watchUrl = buildWatchUrl(nextVideoId);

  if (message.playbackTabId !== null) {
    await setStoredPlaybackContextIndex(message.playbackTabId, playlist.id, message.index);
    await browser.tabs.update(message.playbackTabId, {
      active: true,
      url: watchUrl,
    });
    return;
  }

  if (message.activeTabId !== null && playbackSettings.resumeTabMode === "replace-current-tab") {
    await setStoredPlaybackContextIndex(message.activeTabId, playlist.id, message.index);
    await browser.tabs.update(message.activeTabId, {
      active: true,
      url: watchUrl,
    });
    return;
  }

  const createdTab = await browser.tabs.create({
    active: true,
    url: watchUrl,
  });

  if (typeof createdTab.id !== "number") {
    throw new Error("新しいタブを作成できませんでした。");
  }

  await setStoredPlaybackContextIndex(createdTab.id, playlist.id, message.index);
}

export async function handlePopupMessage(message: PopupMessage): Promise<void> {
  switch (message.type) {
    case "popup:start-playback":
      await handleStartPlayback(message);
      return;
  }
}
