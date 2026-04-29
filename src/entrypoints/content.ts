import { defineContentScript } from "wxt/utils/define-content-script";

import { initWatchContent } from "@/contents/watch";

export default defineContentScript({
  matches: ["https://www.nicovideo.jp/watch/*"],
  main() {
    initWatchContent();
  },
});
