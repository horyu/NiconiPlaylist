import { startPopupPlayback } from "@/background/services/playbackNavigation";
import type { PopupMessage } from "@/lib/popupMessages";

export async function handlePopupMessage(message: PopupMessage): Promise<void> {
  switch (message.type) {
    case "popup:start-playback":
      await startPopupPlayback(message);
      return;
  }
}
