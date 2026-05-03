import type { PlaybackContext, VideoId } from "@/lib/types";

export type WatchSyncPlaybackContextMessage = {
  type: "watch:sync-playback-context";
  videoId: VideoId;
};

export type WatchResolveNextVideoMessage = {
  type: "watch:resolve-next-video";
  videoId: VideoId;
};

export type WatchMessage = WatchSyncPlaybackContextMessage | WatchResolveNextVideoMessage;

export type WatchPlaybackContextResponse = {
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
};
