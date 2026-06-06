import { browser } from "wxt/browser";

import {
  clearPlaybackEndNavigationOverride,
  getPlaybackEndNavigationOverride,
  setPlaybackEndNavigationOverride,
} from "@/background/services/playbackEndNavigationOverride";
import { getStoredPlaybackSettings } from "@/background/services/playbackSettings";
import {
  getStoredPlaylists,
  recordPlaybackDebugEvent,
  setStoredPlaybackContextIndex,
  updateStoredPlaylist,
} from "@/background/services/playlistStore";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import type { PopupMessage } from "@/lib/popupMessages";
import type { PlaybackNavigationSettings } from "@/lib/types";

type PendingRestore = {
  delayMs: number;
  previousActiveTabId: number | null;
  restorePreviousTabEnabled: boolean;
};

const pendingRestoreByPlaybackTabId = new Map<number, PendingRestore>();
const restoreTimeoutIdByPlaybackTabId = new Map<number, ReturnType<typeof setTimeout>>();

export async function focusBrowserTab(tabId: number): Promise<void> {
  console.log("NiconiPlaylist focusing browser tab.", {
    tabId,
  });
  const tab = await browser.tabs.get(tabId);

  if (!tab.active) {
    await browser.tabs.update(tabId, {
      active: true,
    });
  }
}

async function getLastFocusedActiveTabId(): Promise<number | null> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  return typeof activeTab?.id === "number" ? activeTab.id : null;
}

export async function preparePlaybackTabForNavigation(
  tabId: number,
  settings: PlaybackNavigationSettings,
): Promise<void> {
  cancelPendingPlaybackTabNavigation(tabId);

  const previousActiveTabId = await getLastFocusedActiveTabId();
  console.log("NiconiPlaylist preparing playback tab navigation.", {
    previousActiveTabId,
    settings,
    tabId,
  });

  pendingRestoreByPlaybackTabId.set(tabId, {
    delayMs: settings.restorePreviousTabDelayMs,
    restorePreviousTabEnabled: settings.restorePreviousTabEnabled,
    previousActiveTabId,
  });
  console.log("NiconiPlaylist recorded pending playback tab navigation.", {
    delayMs: settings.restorePreviousTabDelayMs,
    previousActiveTabId,
    restorePreviousTabEnabled: settings.restorePreviousTabEnabled,
    tabId,
  });
}

export function cancelPendingPlaybackTabNavigation(tabId: number): void {
  console.log("NiconiPlaylist cancelling pending playback tab navigation.", {
    hasPendingRestore: pendingRestoreByPlaybackTabId.has(tabId),
    hasRestoreTimeout: restoreTimeoutIdByPlaybackTabId.has(tabId),
    tabId,
  });
  const existingRestoreTimeoutId = restoreTimeoutIdByPlaybackTabId.get(tabId);

  if (existingRestoreTimeoutId !== undefined) {
    clearTimeout(existingRestoreTimeoutId);
    restoreTimeoutIdByPlaybackTabId.delete(tabId);
  }

  pendingRestoreByPlaybackTabId.delete(tabId);
}

export async function completePlaybackTabNavigation(tabId: number): Promise<void> {
  const pendingRestore = pendingRestoreByPlaybackTabId.get(tabId);

  if (!pendingRestore) {
    console.log("NiconiPlaylist route-ready received without pending tab restore.", {
      tabId,
    });
    return;
  }

  pendingRestoreByPlaybackTabId.delete(tabId);
  console.log("NiconiPlaylist completing playback tab navigation.", {
    pendingRestore,
    tabId,
  });

  await focusBrowserTab(tabId);

  if (
    !pendingRestore.restorePreviousTabEnabled ||
    pendingRestore.previousActiveTabId === null ||
    pendingRestore.previousActiveTabId === tabId
  ) {
    console.log("NiconiPlaylist keeping playback tab visible after route-ready.", {
      pendingRestore,
      tabId,
    });
    return;
  }

  const previousActiveTabId = pendingRestore.previousActiveTabId;
  const timeoutId = globalThis.setTimeout(() => {
    restoreTimeoutIdByPlaybackTabId.delete(tabId);
    console.log("NiconiPlaylist restoring previously focused tab after navigation.", {
      previousActiveTabId,
      tabId,
    });
    void focusBrowserTab(previousActiveTabId).catch((error: unknown) => {
      console.error("NiconiPlaylist failed to restore previously focused tab.", {
        error,
        previousActiveTabId,
        tabId,
      });
    });
  }, pendingRestore.delayMs);

  restoreTimeoutIdByPlaybackTabId.set(tabId, timeoutId);
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

  if (playlist.popupHidden) {
    await updateStoredPlaylist(playlist.id, {
      popupHidden: false,
    });
  }

  const watchUrl = buildWatchUrl(nextVideoId);
  const transitionMode = message.transitionMode ?? "immediate";

  if (transitionMode === "after-current-ended") {
    if (message.playbackTabId === null) {
      throw new Error("再生中の動画がないため、再生終了後の移動を予約できません。");
    }

    const currentOverride = getPlaybackEndNavigationOverride(message.playbackTabId);

    if (
      currentOverride?.playlistId === playlist.id &&
      currentOverride.nextIndex === message.index
    ) {
      clearPlaybackEndNavigationOverride(message.playbackTabId);
      await recordPlaybackDebugEvent("playback-end-navigation-override", "toggle-off", {
        playlistId: playlist.id,
        tabId: message.playbackTabId,
        overrideNextIndex: message.index,
        overrideNextVideoId: nextVideoId,
      });
      return;
    }

    setPlaybackEndNavigationOverride(
      message.playbackTabId,
      playlist.id,
      message.index,
      nextVideoId,
    );
    await recordPlaybackDebugEvent("playback-end-navigation-override", "set", {
      playlistId: playlist.id,
      tabId: message.playbackTabId,
      overrideNextIndex: message.index,
      overrideNextVideoId: nextVideoId,
    });
    return;
  }

  if (message.playbackTabId !== null) {
    clearPlaybackEndNavigationOverride(message.playbackTabId);
    await setStoredPlaybackContextIndex(message.playbackTabId, playlist.id, message.index);
    await browser.tabs.update(message.playbackTabId, {
      active: true,
      url: watchUrl,
    });
    return;
  }

  if (message.activeTabId !== null && playbackSettings.resumeTabMode === "replace-current-tab") {
    clearPlaybackEndNavigationOverride(message.activeTabId);
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
