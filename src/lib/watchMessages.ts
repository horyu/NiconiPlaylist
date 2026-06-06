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
  markCompleted?: boolean;
};

export type WatchFocusTabMessage = {
  type: "watch:focus-tab";
};

export type WatchShowCompletionAlertMessage = {
  type: "watch:show-completion-alert";
  message: string;
};

export type WatchRecordPlaybackDebugEventMessage = {
  type: "watch:record-playback-debug-event";
  eventType: "pause" | "ended";
  href: string;
  isAdvertisementVideo: boolean;
  isVideoElement: boolean;
  targetTagName: string | null;
  videoCurrentSrc: string | null;
  videoCurrentTime: number | null;
  videoDuration: number | null;
  videoEnded: boolean | null;
  videoPaused: boolean | null;
  videoTitle: string | null;
  videoId: VideoId | null;
};

export type WatchInitLocationObserverMessage = {
  type: "watch:init-location-observer";
};

export type WatchRouteReadyMessage = {
  type: "watch:route-ready";
};

export type WatchMessage =
  | WatchSyncPlaybackContextMessage
  | WatchResolveNextVideoMessage
  | WatchNavigateNextVideoMessage
  | WatchInitLocationObserverMessage
  | WatchRouteReadyMessage
  | WatchClearPlaybackContextMessage
  | WatchFocusTabMessage
  | WatchShowCompletionAlertMessage
  | WatchRecordPlaybackDebugEventMessage;

export type WatchPlaybackContextResponse = {
  forceSkipCurrentVideoRepeat?: boolean;
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
  playbackSettings: PlaybackSettings | null;
};
