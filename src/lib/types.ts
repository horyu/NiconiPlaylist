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
  activeRepeatPresetId: string | null;
  presets: RepeatPreset[];
  completion: PlaybackCompletionSettings;
};

export type PlaybackCompletionSettings = {
  playSoundEnabled: boolean;
  soundVolume: number;
  soundRepeatCount: number;
  focusTabEnabled: boolean;
  alertEnabled: boolean;
};

export type Playlist = {
  id: PlaylistId;
  videoIds: VideoId[];
  title?: string;
  memo?: string;
};

export type PlaybackContext = {
  playlistId: PlaylistId;
  tabId: number;
  currentIndex: number;
};
