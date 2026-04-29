import { browser } from "wxt/browser";

import { importSharedPlaylist } from "@/background/services/importPlaylist";
import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
import { MESSAGE_TYPES } from "@/lib/messages";

export function registerPlaylistHandlers() {
  browser.runtime.onMessage.addListener(async (message) => {
    if (!message || typeof message !== "object") {
      return undefined;
    }

    if (message.type === MESSAGE_TYPES.getPlaylistsState) {
      const [playlists, lastActivePlaylistId] = await Promise.all([
        getStoredPlaylists(),
        getLastActivePlaylistId(),
      ]);

      return {
        playlists,
        lastActivePlaylistId,
      };
    }

    if (
      message.type === MESSAGE_TYPES.importSharedPlaylist &&
      typeof message.sharedUrl === "string"
    ) {
      const playlist = await importSharedPlaylist(message.sharedUrl);

      return {
        playlist,
      };
    }

    return undefined;
  });
}
