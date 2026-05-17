export type VideoId = string;

export type PlaylistId = string;

export type RepeatPresetMode = "count" | "duration";

export type RepeatPreset =
  | {
      id: string;
      mode: "count";
      count: number;
    }
  | {
      id: string;
      mode: "duration";
      durationSeconds: number;
    };

export type PlaybackSettings = {
  playlistRepeatEnabled: boolean;
  resumeTabMode: PlaybackResumeTabMode;
  activeRepeatPresetId: string | null;
  presets: RepeatPreset[];
  navigation: PlaybackNavigationSettings;
  completion: PlaybackCompletionSettings;
};

export type PlaybackResumeTabMode = "new-tab" | "replace-current-tab";

export type PlaybackCompletionSettings = {
  playSoundEnabled: boolean;
  soundVolume: number;
  soundRepeatCount: number;
  focusTabEnabled: boolean;
  alertEnabled: boolean;
};

export type PlaybackNavigationSettings = {
  restorePreviousTabEnabled: boolean;
  restorePreviousTabDelayMs: number;
};

export type Playlist = {
  id: PlaylistId;
  videoIds: VideoId[];
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
  lastCompletedAt: string | null;
  title?: string;
  memo?: string;
  popupHidden?: boolean;
};

export type PlaybackContext = {
  playlistId: PlaylistId;
  tabId: number;
  currentIndex: number;
};
