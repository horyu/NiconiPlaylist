import { browser } from "wxt/browser";

import { registerPlaylistHandlers } from "@/background/handlers/playlists";

export function initBackground() {
  registerPlaylistHandlers();
  console.log("NiconiPlaylist background loaded.", { id: browser.runtime.id });
}
