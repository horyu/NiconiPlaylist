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

  return undefined;
}
