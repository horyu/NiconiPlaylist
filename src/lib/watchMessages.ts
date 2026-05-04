import type { PlaybackContext, VideoId } from "@/lib/types";

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

export type WatchInitLocationObserverMessage = {
  type: "watch:init-location-observer";
};

export type WatchMessage =
  | WatchSyncPlaybackContextMessage
  | WatchResolveNextVideoMessage
  | WatchNavigateNextVideoMessage
  | WatchInitLocationObserverMessage;

export type WatchPlaybackContextResponse = {
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
};
