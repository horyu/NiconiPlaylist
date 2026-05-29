import { browser } from "wxt/browser";

import {
  cancelPendingPlaybackTabNavigation,
  completePlaybackTabNavigation,
  focusBrowserTab,
  preparePlaybackTabForNavigation,
} from "@/background/services/playbackNavigation";
import { getStoredPlaybackSettings } from "@/background/services/playbackSettings";
import {
  clearStoredPlaybackContextByTabId,
  markStoredPlaylistCompletedByTabId,
  recordContentPlaybackDebugEvent,
  resolveNextVideoForPlaybackContext,
  syncPlaybackContextForVideo,
} from "@/background/services/playlistStore";
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
      playbackSettings: null,
    };
  }

  switch (message.type) {
    case "watch:sync-playback-context":
      return {
        playbackContext: await syncPlaybackContextForVideo(tabId, message.videoId),
        nextVideoId: null,
        playbackSettings: await getStoredPlaybackSettings(),
      };

    case "watch:resolve-next-video": {
      const [playbackSettings, playbackState] = await Promise.all([
        getStoredPlaybackSettings(),
        resolveNextVideoForPlaybackContext(tabId, message.videoId),
      ]);

      return {
        playbackContext: playbackState.playbackContext,
        nextVideoId:
          playbackState.nextVideoId ??
          (playbackSettings.playlistRepeatEnabled ? playbackState.firstVideoId : null),
        playbackSettings,
      };
    }

    case "watch:clear-playback-context":
      if (message.markCompleted) {
        await markStoredPlaylistCompletedByTabId(tabId);
      }
      await clearStoredPlaybackContextByTabId(
        tabId,
        message.markCompleted ? "watch-clear-after-complete" : "watch-clear",
      );
      return {
        playbackContext: null,
        nextVideoId: null,
        playbackSettings: null,
      };

    case "watch:navigate-next-video": {
      const playbackSettings = await getStoredPlaybackSettings();
      console.log("NiconiPlaylist handling watch:navigate-next-video.", {
        tabId,
        url: message.url,
        navigation: playbackSettings.navigation,
      });
      await preparePlaybackTabForNavigation(tabId, playbackSettings.navigation);

      try {
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
        console.log("NiconiPlaylist watch:navigate-next-video executed script successfully.", {
          tabId,
          url: message.url,
        });
      } catch (error) {
        console.error("NiconiPlaylist watch:navigate-next-video failed to execute script.", {
          error,
          tabId,
          url: message.url,
        });
        cancelPendingPlaybackTabNavigation(tabId);
        throw error;
      }
      return undefined;
    }

    case "watch:route-ready":
      console.log("NiconiPlaylist handling watch:route-ready.", {
        tabId,
      });
      await completePlaybackTabNavigation(tabId);
      return undefined;

    case "watch:focus-tab": {
      await focusBrowserTab(tabId);
      return undefined;
    }

    case "watch:show-completion-alert":
      await browser.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: (alertMessage: string) => {
          alert(alertMessage);
        },
        args: [message.message],
      });
      return undefined;

    case "watch:record-playback-debug-event": {
      const { type: _type, ...event } = message;
      await recordContentPlaybackDebugEvent(tabId, event);
      return undefined;
    }

    case "watch:init-location-observer":
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

    default: {
      message satisfies never;
      return undefined;
    }
  }
}
