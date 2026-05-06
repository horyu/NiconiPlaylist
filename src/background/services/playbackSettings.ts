import { sanitizePlaybackSettings } from "@/lib/playlistLoop";
import type { PlaybackSettings } from "@/lib/types";

import { getStorageData, setStorageData } from "./storage";

export async function getStoredPlaybackSettings() {
  const { playbackSettings } = await getStorageData(["playbackSettings"]);

  return sanitizePlaybackSettings(playbackSettings);
}

export async function setStoredPlaybackSettings(playbackSettings: PlaybackSettings): Promise<void> {
  await setStorageData({
    playbackSettings: sanitizePlaybackSettings(playbackSettings),
  });
}
