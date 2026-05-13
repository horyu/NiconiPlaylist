import { browser } from "wxt/browser";

import { getStoredPlaybackSettings } from "@/background/services/playbackSettings";
import {
  getStoredPlaylists,
  setStoredPlaybackContextIndex,
} from "@/background/services/playlistStore";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import type { PopupMessage } from "@/lib/popupMessages";
import type { PlaybackNavigationSettings } from "@/lib/types";

export async function focusBrowserTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  const tasks: Promise<unknown>[] = [
    browser.tabs.update(tabId, {
      active: true,
    }),
  ];

  if (typeof tab.windowId === "number") {
    tasks.push(
      browser.windows.update(tab.windowId, {
        focused: true,
      }),
    );
  }

  await Promise.all(tasks);
}

async function getLastFocusedActiveTabId(): Promise<number | null> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  return typeof activeTab?.id === "number" ? activeTab.id : null;
}

export async function focusPlaybackTabForNavigation(
  tabId: number,
  settings: PlaybackNavigationSettings,
): Promise<void> {
  const previousActiveTabId = await getLastFocusedActiveTabId();

  await focusBrowserTab(tabId);

  if (
    !settings.restorePreviousTabEnabled ||
    previousActiveTabId === null ||
    previousActiveTabId === tabId
  ) {
    return;
  }

  globalThis.setTimeout(() => {
    void focusBrowserTab(previousActiveTabId).catch((error: unknown) => {
      console.error("NiconiPlaylist failed to restore previously focused tab.", {
        error,
        previousActiveTabId,
        tabId,
      });
    });
  }, settings.restorePreviousTabDelayMs);
}

export async function startPopupPlayback(
  message: PopupMessage & { type: "popup:start-playback" },
): Promise<void> {
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
