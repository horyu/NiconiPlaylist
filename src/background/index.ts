import { browser } from "wxt/browser";

import { handleWatchMessage } from "@/background/handlers/watch";
import type { WatchMessage } from "@/lib/watchMessages";

export function initBackground() {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      typeof (message as { type?: unknown }).type !== "string"
    ) {
      return undefined;
    }

    const type = (message as { type: string }).type;

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
