import { browser } from "wxt/browser";

import {
  clearStoredPlaybackContextByTabId,
  resolveNextVideoForPlaybackContext,
  syncPlaybackContextForVideo,
} from "@/background/services/playlistStore";
import { getStoredRepeatSettings } from "@/background/services/repeatSettings";
import type { WatchMessage, WatchPlaybackContextResponse } from "@/lib/watchMessages";

type MessageSender = {
  tab?: {
    id?: number;
  };
};

export async function handleWatchMessage(
  message: WatchMessage,
  sender: MessageSender,
): Promise<WatchPlaybackContextResponse | undefined> {
  const tabId = sender.tab?.id;

  if (tabId === undefined) {
    return {
      playbackContext: null,
      nextVideoId: null,
      repeatSettings: null,
    };
  }

  if (message.type === "watch:sync-playback-context") {
    return {
      playbackContext: await syncPlaybackContextForVideo(tabId, message.videoId),
      nextVideoId: null,
      repeatSettings: await getStoredRepeatSettings(),
    };
  }

  if (message.type === "watch:resolve-next-video") {
    const [playbackState, repeatSettings] = await Promise.all([
      resolveNextVideoForPlaybackContext(tabId, message.videoId),
      getStoredRepeatSettings(),
    ]);

    return {
      ...playbackState,
      repeatSettings,
    };
  }

  if (message.type === "watch:clear-playback-context") {
    await clearStoredPlaybackContextByTabId(tabId);
    return {
      playbackContext: null,
      nextVideoId: null,
      repeatSettings: null,
    };
  }

  if (message.type === "watch:navigate-next-video") {
    await browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (nextVideoUrl: string) => {
        const nav = (
          window as typeof window & {
            __reactRouterDataRouter?: { navigate?: (to: string, options?: unknown) => void };
          }
        ).__reactRouterDataRouter?.navigate;
        const url = new URL(nextVideoUrl, location.href);

        if (typeof nav === "function") {
          nav(url.pathname + url.search + url.hash, {
            preventScrollReset: true,
          });
        } else {
          location.href = url.href;
        }
      },
      args: [message.url],
    });
    return undefined;
  }

  if (message.type === "watch:init-location-observer") {
    await browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const key = "__niconiPlaylistWatchLocationObserverInitialized";
        const state = window as typeof window & {
          [key]?: boolean;
        };

        if (state[key]) {
          return;
        }

        state[key] = true;

        const notify = () => {
          window.dispatchEvent(new Event("niconiplaylist:locationchange"));
        };
        const originalPushState = history.pushState;
        history.pushState = function (...args) {
          originalPushState.apply(this, args as Parameters<History["pushState"]>);
          notify();
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function (...args) {
          originalReplaceState.apply(this, args as Parameters<History["replaceState"]>);
          notify();
        };

        window.addEventListener("popstate", notify);
      },
    });
    return undefined;
  }

  return undefined;
}
