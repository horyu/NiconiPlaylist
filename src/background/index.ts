import { browser } from "wxt/browser";

export function initBackground() {
  console.log("NiconiPlaylist background loaded.", { id: browser.runtime.id });
}
