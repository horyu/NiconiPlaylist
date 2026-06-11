import { shouldRepeatCurrentVideo } from "@/lib/playlistLoop";
import type { PlaybackContext, PlaybackSettings, VideoId } from "@/lib/types";

export type PlaybackTerminalEventType = "pause" | "ended";

export type PlaybackTransitionState = {
  completedPlaybackCount: number;
  currentLoopVideoId: VideoId | null;
  lastHandledPlaybackEnd: {
    at: number;
    eventType: PlaybackTerminalEventType;
    signature: string;
  } | null;
};

export type PlaybackEndResolution = {
  forceSkipCurrentVideoRepeat?: boolean;
  playbackContext: PlaybackContext | null;
  nextVideoId: VideoId | null;
  playbackSettings: PlaybackSettings | null;
};

export type PlaybackEndCommand =
  | { type: "restart-current-video"; videoId: VideoId }
  | { type: "navigate-next-video"; nextVideoId: VideoId }
  | { type: "clear-playback-context"; markCompleted: boolean; notifyCompletion: boolean };

export type WatchRouteState = {
  expectedNextVideoId: VideoId | null;
  routeReadyArmed: boolean;
  routeReadySawFromZero: boolean;
};

export type WatchRouteCommand =
  | { type: "force-expected-navigation"; expectedNextVideoId: VideoId }
  | { type: "route-ready"; syncPlaybackContext: boolean }
  | { type: "sync-and-arm-route-ready" };

export type PendingTabRestore = {
  delayMs: number;
  previousActiveTabId: number | null;
  restorePreviousTabEnabled: boolean;
};

export type CompletedTabNavigationCommand =
  | { type: "no-pending-navigation" }
  | { type: "keep-playback-tab-visible" }
  | { type: "restore-previous-tab"; delayMs: number; previousActiveTabId: number };

export function createPlaybackTransitionState(): PlaybackTransitionState {
  return {
    completedPlaybackCount: 0,
    currentLoopVideoId: null,
    lastHandledPlaybackEnd: null,
  };
}

export function resetPlaybackLoopProgress(
  state: PlaybackTransitionState,
  videoId: VideoId | null,
): PlaybackTransitionState {
  return {
    ...state,
    completedPlaybackCount: 0,
    currentLoopVideoId: videoId,
  };
}

export function restorePlaybackLoopProgress(
  state: PlaybackTransitionState,
  videoId: VideoId,
  completedPlaybackCount: number,
): PlaybackTransitionState {
  return {
    ...state,
    completedPlaybackCount,
    currentLoopVideoId: videoId,
  };
}

export function observePlaybackEnd(
  state: PlaybackTransitionState,
  event: {
    at: number;
    eventType: PlaybackTerminalEventType;
    signature: string;
  },
  deduplicationWindowMs: number,
): { state: PlaybackTransitionState; shouldResolve: boolean } {
  const lastHandledPlaybackEnd = state.lastHandledPlaybackEnd;
  const isDuplicate =
    lastHandledPlaybackEnd !== null &&
    lastHandledPlaybackEnd.signature === event.signature &&
    lastHandledPlaybackEnd.eventType !== event.eventType &&
    event.at - lastHandledPlaybackEnd.at <= deduplicationWindowMs;

  if (isDuplicate) {
    return {
      state,
      shouldResolve: false,
    };
  }

  return {
    state: {
      ...state,
      lastHandledPlaybackEnd: event,
    },
    shouldResolve: true,
  };
}

export function resolvePlaybackEndTransition(
  state: PlaybackTransitionState,
  input: {
    durationSeconds: number;
    playbackState: PlaybackEndResolution | null;
    videoId: VideoId;
  },
): { command: PlaybackEndCommand; state: PlaybackTransitionState } {
  const { playbackState, videoId } = input;
  const hasPlaybackContext = playbackState?.playbackContext != null;
  const nextCompletedPlaybackCount =
    state.currentLoopVideoId === videoId ? state.completedPlaybackCount + 1 : 1;

  if (
    !playbackState?.forceSkipCurrentVideoRepeat &&
    hasPlaybackContext &&
    playbackState.playbackSettings &&
    shouldRepeatCurrentVideo(
      playbackState.playbackSettings,
      nextCompletedPlaybackCount,
      input.durationSeconds,
    )
  ) {
    return {
      command: { type: "restart-current-video", videoId },
      state: {
        ...state,
        completedPlaybackCount: nextCompletedPlaybackCount,
        currentLoopVideoId: videoId,
      },
    };
  }

  const nextState = resetPlaybackLoopProgress(state, null);

  if (playbackState?.nextVideoId) {
    return {
      command: {
        type: "navigate-next-video",
        nextVideoId: playbackState.nextVideoId,
      },
      state: nextState,
    };
  }

  const completed =
    hasPlaybackContext &&
    playbackState?.playbackSettings != null &&
    !playbackState.playbackSettings.playlistRepeatEnabled;

  return {
    command: {
      type: "clear-playback-context",
      markCompleted: completed,
      notifyCompletion: completed,
    },
    state: nextState,
  };
}

export function resolveNextPlaybackVideo(input: {
  firstVideoId: VideoId | null;
  nextVideoId: VideoId | null;
  overrideNextVideoId: VideoId | null;
  playbackContext: PlaybackContext | null;
  playbackSettings: PlaybackSettings;
}): PlaybackEndResolution {
  if (!input.playbackContext) {
    return {
      forceSkipCurrentVideoRepeat: false,
      playbackContext: null,
      nextVideoId: null,
      playbackSettings: null,
    };
  }

  return {
    forceSkipCurrentVideoRepeat: input.overrideNextVideoId !== null,
    playbackContext: input.playbackContext,
    nextVideoId:
      input.overrideNextVideoId ??
      input.nextVideoId ??
      (input.playbackSettings.playlistRepeatEnabled ? input.firstVideoId : null),
    playbackSettings: input.playbackSettings,
  };
}

export function createWatchRouteState(): WatchRouteState {
  return {
    expectedNextVideoId: null,
    routeReadyArmed: false,
    routeReadySawFromZero: false,
  };
}

export function setExpectedWatchNavigation(
  state: WatchRouteState,
  expectedNextVideoId: VideoId | null,
): WatchRouteState {
  return {
    ...state,
    expectedNextVideoId,
  };
}

export function armWatchRouteReady(
  state: WatchRouteState,
  input: { currentVideoId: VideoId | null; hasFromZero: boolean },
): WatchRouteState {
  if (!input.currentVideoId) {
    return state;
  }

  return {
    ...state,
    routeReadyArmed: true,
    routeReadySawFromZero: input.hasFromZero,
  };
}

export function observeWatchRouteChange(
  state: WatchRouteState,
  input: { currentVideoId: VideoId | null; hasFromZero: boolean },
): { command: WatchRouteCommand; state: WatchRouteState } {
  if (state.expectedNextVideoId !== null && input.currentVideoId !== state.expectedNextVideoId) {
    return {
      command: {
        type: "force-expected-navigation",
        expectedNextVideoId: state.expectedNextVideoId,
      },
      state,
    };
  }

  if (
    state.routeReadyArmed &&
    state.routeReadySawFromZero &&
    !input.hasFromZero &&
    (state.expectedNextVideoId === null || input.currentVideoId === state.expectedNextVideoId)
  ) {
    return {
      command: {
        type: "route-ready",
        syncPlaybackContext: true,
      },
      state: {
        ...state,
        routeReadyArmed: false,
      },
    };
  }

  return {
    command: { type: "sync-and-arm-route-ready" },
    state,
  };
}

export function resolveCompletedTabNavigation(
  playbackTabId: number,
  pendingRestore: PendingTabRestore | null,
): CompletedTabNavigationCommand {
  if (!pendingRestore) {
    return { type: "no-pending-navigation" };
  }

  if (
    !pendingRestore.restorePreviousTabEnabled ||
    pendingRestore.previousActiveTabId === null ||
    pendingRestore.previousActiveTabId === playbackTabId
  ) {
    return { type: "keep-playback-tab-visible" };
  }

  return {
    type: "restore-previous-tab",
    delayMs: pendingRestore.delayMs,
    previousActiveTabId: pendingRestore.previousActiveTabId,
  };
}
