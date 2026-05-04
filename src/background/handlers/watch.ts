import { browser } from "wxt/browser";

import {
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
    };
  }

  if (message.type === "watch:sync-playback-context") {
    return {
      playbackContext: await syncPlaybackContextForVideo(tabId, message.videoId),
      nextVideoId: null,
    };
  }

  if (message.type === "watch:resolve-next-video") {
    return resolveNextVideoForPlaybackContext(tabId, message.videoId);
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

  return undefined;
}
