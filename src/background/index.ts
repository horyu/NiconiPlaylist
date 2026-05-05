import { browser } from "wxt/browser";

import { handleWatchMessage } from "@/background/handlers/watch";
import { getStorageData } from "@/background/services/storage";
import { initUserAgentOverride } from "@/background/services/userAgent";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { isPlaybackContext } from "@/lib/typeGuards";
import type { WatchMessage } from "@/lib/watchMessages";

const PLAYBACK_BADGE_TEXT = "▶";
const PLAYBACK_BADGE_COLOR = "#16a34a";
const PLAYBACK_BADGE_BG = "rgba(0,0,0,0)";
const WATCH_URL_PREFIX = "https://www.nicovideo.jp/watch/";

function updatePlaybackBadge(playbackCount: number) {
  if (!browser.action) {
    return;
  }

  if (playbackCount > 0) {
    void browser.action.setBadgeBackgroundColor({ color: PLAYBACK_BADGE_BG });
    if (typeof browser.action.setBadgeTextColor === "function") {
      void browser.action.setBadgeTextColor({ color: PLAYBACK_BADGE_COLOR });
    }
    void browser.action.setBadgeText({ text: PLAYBACK_BADGE_TEXT });
  } else {
    void browser.action.setBadgeText({ text: "" });
  }
}

async function resolveAlivePlaybackCount(playbackContexts: unknown[]): Promise<number> {
  const validContexts = playbackContexts.filter(isPlaybackContext);
  const settledTabs = await Promise.allSettled(
    validContexts.map((context) =>
      browser.tabs.get(context.tabId).then((tab) => {
        if (!tab.url || !tab.url.startsWith(WATCH_URL_PREFIX)) {
          return null;
        }

        return tab.id ?? null;
      }),
    ),
  );

  return settledTabs.filter(
    (result) => result.status === "fulfilled" && typeof result.value === "number",
  ).length;
}

async function refreshPlaybackBadgeFromStorage() {
  const { playbackContexts } = await getStorageData(["playbackContexts"]);
  const aliveCount = await resolveAlivePlaybackCount(playbackContexts);
  updatePlaybackBadge(aliveCount);
}

export function initBackground() {
  void initUserAgentOverride().catch((error: unknown) => {
    console.error("NiconiPlaylist failed to initialize User-Agent override.", {
      error,
    });
  });

  browser.storage.onChanged.addListener((changes) => {
    if (!changes[STORAGE_KEYS.playbackContexts]) {
      return;
    }

    const newValue = changes[STORAGE_KEYS.playbackContexts]?.newValue;
    const playbackContexts = Array.isArray(newValue) ? newValue : [];
    void resolveAlivePlaybackCount(playbackContexts).then((aliveCount) => {
      updatePlaybackBadge(aliveCount);
    });
  });

  void refreshPlaybackBadgeFromStorage();

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      typeof (message as { type?: unknown }).type !== "string"
    ) {
      return undefined;
    }

    const type = (message as { type: string }).type;

    if (type === "badge:refresh") {
      void refreshPlaybackBadgeFromStorage();
      return undefined;
    }

    if (!type.startsWith("watch:")) {
      return undefined;
    }

    void handleWatchMessage(message as WatchMessage, sender)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error: unknown) => {
        console.error("NiconiPlaylist failed to handle watch message.", {
          error,
          message,
        });
        sendResponse({
          playbackContext: null,
          nextVideoId: null,
        });
      });

    return true;
  });

  console.log("NiconiPlaylist background loaded.", { id: browser.runtime.id });
}
