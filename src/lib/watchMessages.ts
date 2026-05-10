import type { PlaybackContext, PlaybackSettings, VideoId } from "@/lib/types";

export type WatchSyncPlaybackContextMessage = {
  type: "watch:sync-playback-context";
  videoId: VideoId;
};

export type WatchResolveNextVideoMessage = {
  type: "watch:resolve-next-video";
  videoId: VideoId;
};

export type WatchNavigateNextVideoMessage = {
  type: "watch:navigate-next-video";
  url: string;
};

export type WatchClearPlaybackContextMessage = {
  type: "watch:clear-playback-context";
};

export type WatchFocusTabMessage = {
  type: "watch:focus-tab";
};

export type WatchShowCompletionAlertMessage = {
  type: "watch:show-completion-alert";
  message: string;
};

export type WatchInitLocationObserverMessage = {
  type: "watch:init-location-observer";
};

export type WatchMessage =
  | WatchSyncPlaybackContextMessage
  | WatchResolveNextVideoMessage
  | WatchNavigateNextVideoMessage
  | WatchInitLocationObserverMessage
  | WatchClearPlaybackContextMessage
  | WatchFocusTabMessage
  | WatchShowCompletionAlertMessage;

export type WatchPlaybackContextResponse = {
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
  playbackSettings: PlaybackSettings | null;
};
