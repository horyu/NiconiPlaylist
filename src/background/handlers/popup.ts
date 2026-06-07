import { getPlaybackEndNavigationOverrides } from "@/background/services/playbackEndNavigationOverride";
import { startPopupPlayback } from "@/background/services/playbackNavigation";
import type { PopupMessage, PopupPendingPlaybackEndNavigationResponse } from "@/lib/popupMessages";

export async function handlePopupMessage(
  message: PopupMessage,
): Promise<void | PopupPendingPlaybackEndNavigationResponse> {
  switch (message.type) {
    case "popup:start-playback":
      await startPopupPlayback(message);
      return;
    case "popup:get-pending-playback-end-navigation":
      return Object.fromEntries(
        Array.from((await getPlaybackEndNavigationOverrides()).entries(), ([tabId, override]) => [
          tabId,
          {
            nextIndex: override.nextIndex,
            playlistId: override.playlistId,
          },
        ]),
      );
  }
}
