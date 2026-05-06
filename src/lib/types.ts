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

export type RepeatSettings = {
  activeRepeatPresetId: string | null;
  presets: RepeatPreset[];
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
