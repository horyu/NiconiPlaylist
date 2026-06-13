import { sanitizePlaybackSettings } from "@/lib/playlistLoop";
import type {
  PlaybackCompletionSettings,
  PlaybackNavigationSettings,
  PlaybackResumeTabMode,
  PlaybackSettings,
  RepeatPreset,
} from "@/lib/types";

import { getStorageData, mutateStorage } from "./storage";

export async function getStoredPlaybackSettings() {
  const { playbackSettings } = await getStorageData(["playbackSettings"]);

  return sanitizePlaybackSettings(playbackSettings);
}

export async function updateStoredPlaybackSettings(
  updater: (playbackSettings: PlaybackSettings) => PlaybackSettings,
): Promise<PlaybackSettings> {
  return mutateStorage(["playbackSettings"], ({ playbackSettings }) => {
    const nextPlaybackSettings = sanitizePlaybackSettings(
      updater(sanitizePlaybackSettings(playbackSettings)),
    );

    return {
      updates: { playbackSettings: nextPlaybackSettings },
      result: nextPlaybackSettings,
    };
  });
}

export type PlaybackSettingsDraft = {
  completion: PlaybackCompletionSettings;
  navigation: PlaybackNavigationSettings;
  presets: RepeatPreset[];
  resumeTabMode: PlaybackResumeTabMode;
};

export async function saveStoredPlaybackSettingsDraft(draft: PlaybackSettingsDraft): Promise<void> {
  await updateStoredPlaybackSettings((currentPlaybackSettings) =>
    sanitizePlaybackSettings({
      ...currentPlaybackSettings,
      ...draft,
    }),
  );
}
