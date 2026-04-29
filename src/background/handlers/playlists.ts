import { browser } from "wxt/browser";

import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
import { MESSAGE_TYPES } from "@/lib/messages";

export function registerPlaylistHandlers() {
  browser.runtime.onMessage.addListener(async (message) => {
    if (!message || typeof message !== "object") {
      return undefined;
    }

    if (message.type === MESSAGE_TYPES.getPopupState) {
      const [playlists, lastActivePlaylistId] = await Promise.all([
        getStoredPlaylists(),
        getLastActivePlaylistId(),
      ]);

      return {
        playlists,
        lastActivePlaylistId,
      };
    }

    return undefined;
  });
}
