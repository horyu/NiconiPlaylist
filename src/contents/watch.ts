import { browser } from "wxt/browser";

import completionSoundPath from "@/assets/ui-soft-glass-ping.m4a";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import {
  armWatchRouteReady,
  createPlaybackTransitionState,
  createWatchRouteState,
  observePlaybackEnd,
  observeWatchRouteChange,
  resetPlaybackLoopProgress,
  restorePlaybackLoopProgress,
  resolvePlaybackEndTransition,
  setExpectedWatchNavigation,
} from "@/lib/playbackTransition";
import { playRepeatedAudio } from "@/lib/playRepeatedAudio";
import type { PlaybackCompletionSettings } from "@/lib/types";
import type { WatchPlaybackContextResponse } from "@/lib/watchMessages";

const PLAYBACK_END_THRESHOLD_SECONDS = 1;
const PLAYBACK_END_DEDUPLICATION_WINDOW_MS = 5_000;
const ROUTE_READY_DELAY_MS = 50;
const WATCH_CONTENT_INIT_KEY = "__niconiPlaylistWatchContentInitialized";
const WATCH_LOCATION_OBSERVER_KEY = "__niconiPlaylistWatchLocationObserverInitialized";
const LOOP_PROGRESS_RESTORE_STORAGE_KEY = "__niconiPlaylistLoopProgressRestore";
const LOOP_PROGRESS_RESTORE_TTL_MS = 10_000;
const ADVERTISEMENT_TITLE_FRAGMENT = "Advertisement";
const ADVERTISEMENT_SRC_PREFIX = "https://dcdn.cdn.nimg.jp/nicoad/instream/video";
const CURRENT_TIME_SLIDER_SELECTOR = '[aria-label="video - currentTime"][role="slider"]';
const WATCH_VIDEO_ID_PATH_PATTERN = /^\/watch\/((sm|so|nm)[1-9][0-9]{0,8})$/u;
const PLAYLIST_COMPLETED_ALERT_MESSAGE = "プレイリストの再生が終了しました。";

function isVideoElement(target: EventTarget | null): target is HTMLVideoElement {
  return target instanceof HTMLVideoElement;
}

function isAdvertisementVideo(video: HTMLVideoElement): boolean {
  const title = video.title.trim();
  const src = video.currentSrc || video.src;

  return title.includes(ADVERTISEMENT_TITLE_FRAGMENT) || src.startsWith(ADVERTISEMENT_SRC_PREFIX);
}

function getCurrentTimeSliderValue(): number | null {
  const slider = document.querySelector(CURRENT_TIME_SLIDER_SELECTOR);

  if (!(slider instanceof HTMLElement)) {
    return null;
  }

  const value = Number(slider.getAttribute("aria-valuenow"));

  return Number.isFinite(value) ? value : null;
}

function isPlaybackEndedByPause(video: HTMLVideoElement): boolean {
  if (video.ended) {
    return true;
  }

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return false;
  }

  if (video.duration - video.currentTime <= PLAYBACK_END_THRESHOLD_SECONDS) {
    return true;
  }

  const sliderCurrentTime = getCurrentTimeSliderValue();

  if (sliderCurrentTime === null) {
    return false;
  }

  return sliderCurrentTime >= video.duration;
}

function getCurrentWatchVideoId(): string | null {
  const match = location.pathname.match(WATCH_VIDEO_ID_PATH_PATTERN);
  return match?.[1] ?? null;
}

function logPlaybackEvent(eventType: "pause" | "ended", event: Event): void {
  const target = event.target;
  const isVideo = isVideoElement(target);
  const advertisementVideo = isVideo ? isAdvertisementVideo(target) : false;
  const payload = {
    eventType,
    href: location.href,
    isAdvertisementVideo: advertisementVideo,
    isVideoElement: isVideo,
    targetTagName: target instanceof Element ? target.tagName : null,
    videoCurrentSrc: isVideo ? target.currentSrc || target.src : null,
    videoCurrentTime: isVideo ? target.currentTime : null,
    videoDuration: isVideo ? target.duration : null,
    videoEnded: isVideo ? target.ended : null,
    videoPaused: isVideo ? target.paused : null,
    videoTitle: isVideo ? target.title : null,
    videoId: getCurrentWatchVideoId(),
  };

  console.log(`NiconiPlaylist observed ${eventType} event.`, {
    currentWatchVideoId: payload.videoId,
    href: payload.href,
    isAdvertisementVideo: payload.isAdvertisementVideo,
    isVideoElement: payload.isVideoElement,
    targetTagName: payload.targetTagName,
    videoCurrentSrc: payload.videoCurrentSrc,
    videoCurrentTime: payload.videoCurrentTime,
    videoDuration: payload.videoDuration,
    videoEnded: payload.videoEnded,
    videoPaused: payload.videoPaused,
    videoTitle: payload.videoTitle,
  });
  void browser.runtime.sendMessage({
    type: "watch:record-playback-debug-event",
    ...payload,
  });
}

async function syncPlaybackContext(videoId: string): Promise<WatchPlaybackContextResponse | null> {
  return browser.runtime.sendMessage({
    type: "watch:sync-playback-context",
    videoId,
  });
}

async function resolveNextVideo(videoId: string): Promise<WatchPlaybackContextResponse | null> {
  return browser.runtime.sendMessage({
    type: "watch:resolve-next-video",
    videoId,
  });
}

let lastSyncedVideoId: string | null = null;
let routeReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;
let playbackTransitionState = createPlaybackTransitionState();
let watchRouteState = createWatchRouteState();

function clearExpectedNextVideo(): void {
  watchRouteState = setExpectedWatchNavigation(watchRouteState, null);
}

function setExpectedNextVideo(nextVideoId: string): void {
  watchRouteState = setExpectedWatchNavigation(watchRouteState, nextVideoId);
}

function resetLoopProgress(videoId: string | null): void {
  playbackTransitionState = resetPlaybackLoopProgress(playbackTransitionState, videoId);
}

function persistLoopProgressForForcedNavigation(expectedVideoId: string): void {
  if (
    playbackTransitionState.currentLoopVideoId !== expectedVideoId ||
    playbackTransitionState.completedPlaybackCount <= 0
  ) {
    return;
  }

  try {
    sessionStorage.setItem(
      LOOP_PROGRESS_RESTORE_STORAGE_KEY,
      JSON.stringify({
        completedPlaybackCount: playbackTransitionState.completedPlaybackCount,
        expiresAt: Date.now() + LOOP_PROGRESS_RESTORE_TTL_MS,
        videoId: expectedVideoId,
      }),
    );
  } catch (error) {
    console.warn("NiconiPlaylist failed to persist loop progress for forced navigation.", {
      error,
    });
  }
}

function restoreLoopProgressAfterForcedNavigation(): void {
  try {
    const serialized = sessionStorage.getItem(LOOP_PROGRESS_RESTORE_STORAGE_KEY);

    if (serialized === null) {
      return;
    }

    sessionStorage.removeItem(LOOP_PROGRESS_RESTORE_STORAGE_KEY);
    const snapshot: unknown = JSON.parse(serialized);

    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      !("completedPlaybackCount" in snapshot) ||
      !("expiresAt" in snapshot) ||
      !("videoId" in snapshot) ||
      typeof snapshot.completedPlaybackCount !== "number" ||
      !Number.isInteger(snapshot.completedPlaybackCount) ||
      snapshot.completedPlaybackCount <= 0 ||
      typeof snapshot.expiresAt !== "number" ||
      snapshot.expiresAt < Date.now() ||
      typeof snapshot.videoId !== "string" ||
      snapshot.videoId !== getCurrentWatchVideoId()
    ) {
      return;
    }

    playbackTransitionState = restorePlaybackLoopProgress(
      playbackTransitionState,
      snapshot.videoId,
      snapshot.completedPlaybackCount,
    );
  } catch (error) {
    console.warn("NiconiPlaylist failed to restore loop progress after forced navigation.", {
      error,
    });
  }
}

function buildPlaybackEndSignature(videoId: string, video: HTMLVideoElement): string {
  return [
    videoId,
    video.currentSrc || video.src,
    Math.round(video.currentTime * 1000),
    Math.round(video.duration * 1000),
  ].join("|");
}

function syncPlaybackContextIfNeeded(): void {
  const videoId = getCurrentWatchVideoId();

  if (!videoId || videoId === lastSyncedVideoId) {
    return;
  }

  lastSyncedVideoId = videoId;
  resetLoopProgress(videoId);
  void syncPlaybackContext(videoId);
}

function sendRouteReady(): void {
  if (routeReadyTimeoutId !== null) {
    clearTimeout(routeReadyTimeoutId);
  }

  console.log("NiconiPlaylist route-ready scheduled after timeout.", {
    delayMs: ROUTE_READY_DELAY_MS,
    expectedNextVideoId: watchRouteState.expectedNextVideoId,
  });
  routeReadyTimeoutId = setTimeout(() => {
    routeReadyTimeoutId = null;
    console.log("NiconiPlaylist route-ready sending message.");
    void browser.runtime.sendMessage({
      type: "watch:route-ready",
    });
  }, ROUTE_READY_DELAY_MS);
}

function hasFromZeroSearchParam(): boolean {
  return new URL(location.href).searchParams.get("from") === "0";
}

function armRouteReady(): void {
  const videoId = getCurrentWatchVideoId();

  if (!videoId) {
    console.log(
      "NiconiPlaylist route-ready arm skipped because current watch video id is missing.",
    );
    return;
  }

  if (routeReadyTimeoutId !== null) {
    clearTimeout(routeReadyTimeoutId);
    routeReadyTimeoutId = null;
  }

  watchRouteState = armWatchRouteReady(watchRouteState, {
    currentVideoId: videoId,
    hasFromZero: hasFromZeroSearchParam(),
  });
  console.log("NiconiPlaylist route-ready armed.", {
    expectedNextVideoId: watchRouteState.expectedNextVideoId,
    hasFromZeroSearchParam: watchRouteState.routeReadySawFromZero,
    videoId,
  });
}

function navigateToNextVideo(nextVideoId: string): void {
  const nextVideoUrl = buildWatchUrl(nextVideoId);
  setExpectedNextVideo(nextVideoId);
  console.log("NiconiPlaylist navigating to expected next video.", {
    nextVideoId,
    nextVideoUrl,
  });
  void browser.runtime.sendMessage({
    type: "watch:navigate-next-video",
    url: nextVideoUrl,
  });
}

function forceNavigateToExpectedNextVideo(expectedNextVideoId: string): void {
  const expectedNextVideoUrl = buildWatchUrl(expectedNextVideoId);
  if (location.href === expectedNextVideoUrl) {
    return;
  }

  const currentVideoId = getCurrentWatchVideoId();

  console.warn("NiconiPlaylist detected unexpected next video and is forcing navigation.", {
    currentVideoId,
    currentUrl: location.href,
    expectedNextVideoId,
    expectedNextVideoUrl,
  });
  void browser.runtime.sendMessage({
    type: "watch:record-navigation-debug-event",
    reason: "force-expected-navigation-requested",
    currentUrl: location.href,
    currentVideoId,
    expectedVideoId: expectedNextVideoId,
    expectedVideoUrl: expectedNextVideoUrl,
  });
  persistLoopProgressForForcedNavigation(expectedNextVideoId);
  location.href = expectedNextVideoUrl;
}

function restartCurrentVideo(): void {
  // テンキーではない0キーのkeydownイベントを発火させることで、動画を最初から再生させる
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "0",
      code: "Digit0",
      keyCode: 48,
      which: 48,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function playCompletionSound(settings: PlaybackCompletionSettings): Promise<void> {
  if (!settings.playSoundEnabled) {
    return;
  }

  await playRepeatedAudio(completionSoundPath, {
    repeatCount: settings.soundRepeatCount,
    volume: settings.soundVolume / 100,
  });
}

async function handlePlaylistCompleted(
  playbackState: WatchPlaybackContextResponse | null,
): Promise<void> {
  const completion = playbackState?.playbackSettings?.completion;

  if (!completion) {
    return;
  }

  if (completion.focusTabEnabled) {
    await browser.runtime
      .sendMessage({
        type: "watch:focus-tab",
      })
      .catch((error) => {
        console.error("NiconiPlaylist failed to focus playback tab on playlist completion.", {
          error,
        });
      });
  }

  if (completion.alertEnabled) {
    await browser.runtime
      .sendMessage({
        type: "watch:show-completion-alert",
        message: PLAYLIST_COMPLETED_ALERT_MESSAGE,
      })
      .catch((error) => {
        console.error("NiconiPlaylist failed to show completion alert.", {
          error,
        });
      });
  }

  await playCompletionSound(completion).catch((error) => {
    console.error("NiconiPlaylist failed to play completion sound.", {
      error,
      completion,
    });
  });
}

function initWatchLocationObserver(): void {
  const state = globalThis as typeof globalThis & {
    [WATCH_LOCATION_OBSERVER_KEY]?: boolean;
  };

  if (state[WATCH_LOCATION_OBSERVER_KEY]) {
    return;
  }

  state[WATCH_LOCATION_OBSERVER_KEY] = true;
  window.addEventListener("niconiplaylist:locationchange", () => {
    const hasFromZero = hasFromZeroSearchParam();
    const currentVideoId = getCurrentWatchVideoId();
    console.log("NiconiPlaylist observed location change.", {
      currentVideoId,
      expectedNextVideoId: watchRouteState.expectedNextVideoId,
      hasFromZeroSearchParam: hasFromZero,
      pathname: location.pathname,
      href: location.href,
    });
    const transition = observeWatchRouteChange(watchRouteState, {
      currentVideoId,
      hasFromZero,
    });

    watchRouteState = transition.state;

    switch (transition.command.type) {
      case "force-expected-navigation":
        void browser.runtime.sendMessage({
          type: "watch:record-navigation-debug-event",
          reason: "unexpected-navigation-detected",
          currentUrl: location.href,
          currentVideoId,
          expectedVideoId: transition.command.expectedNextVideoId,
          expectedVideoUrl: buildWatchUrl(transition.command.expectedNextVideoId),
        });
        forceNavigateToExpectedNextVideo(transition.command.expectedNextVideoId);
        return;
      case "route-ready":
        console.log("NiconiPlaylist treating canonical URL change as route-ready.", {
          expectedNextVideoId: watchRouteState.expectedNextVideoId,
          currentVideoId,
          pathname: location.pathname,
          href: location.href,
        });
        sendRouteReady();
        if (transition.command.syncPlaybackContext) {
          syncPlaybackContextIfNeeded();
        }
        return;
      case "sync-and-arm-route-ready":
        syncPlaybackContextIfNeeded();
        armRouteReady();
        return;
    }
  });
  void browser.runtime.sendMessage({
    type: "watch:init-location-observer",
  });
}

async function handlePlaybackTerminalEvent(eventType: "pause" | "ended", event: Event) {
  logPlaybackEvent(eventType, event);
  const target = event.target;

  if (!isVideoElement(target)) {
    return;
  }

  if (isAdvertisementVideo(target)) {
    return;
  }

  if (!isPlaybackEndedByPause(target)) {
    return;
  }

  const videoId = getCurrentWatchVideoId();

  if (!videoId) {
    return;
  }

  const playbackEndSignature = buildPlaybackEndSignature(videoId, target);
  const observedPlaybackEnd = observePlaybackEnd(
    playbackTransitionState,
    {
      at: Date.now(),
      eventType,
      signature: playbackEndSignature,
    },
    PLAYBACK_END_DEDUPLICATION_WINDOW_MS,
  );

  playbackTransitionState = observedPlaybackEnd.state;

  if (!observedPlaybackEnd.shouldResolve) {
    console.log("NiconiPlaylist skipped duplicate playback end handling.", {
      eventType,
      playbackEndSignature,
      videoId,
    });
    return;
  }

  const playbackState = await resolveNextVideo(videoId);
  const transition = resolvePlaybackEndTransition(playbackTransitionState, {
    durationSeconds: target.duration,
    playbackState,
    videoId,
  });

  playbackTransitionState = transition.state;

  switch (transition.command.type) {
    case "restart-current-video":
      setExpectedNextVideo(transition.command.videoId);
      restartCurrentVideo();
      return;
    case "navigate-next-video":
      navigateToNextVideo(transition.command.nextVideoId);
      return;
    case "clear-playback-context":
      clearExpectedNextVideo();
      if (transition.command.notifyCompletion) {
        await handlePlaylistCompleted(playbackState);
      }
      await browser.runtime.sendMessage({
        type: "watch:clear-playback-context",
        markCompleted: transition.command.markCompleted,
      });
      return;
  }
}

function handleEnded(event: Event): void {
  void handlePlaybackTerminalEvent("ended", event);
}

function handlePause(event: Event): void {
  void handlePlaybackTerminalEvent("pause", event);
}

export function initWatchContent() {
  const state = globalThis as typeof globalThis & {
    [WATCH_CONTENT_INIT_KEY]?: boolean;
  };

  if (state[WATCH_CONTENT_INIT_KEY]) {
    return;
  }

  state[WATCH_CONTENT_INIT_KEY] = true;
  document.addEventListener("ended", handleEnded, true);
  document.addEventListener("pause", handlePause, true);
  initWatchLocationObserver();
  syncPlaybackContextIfNeeded();
  restoreLoopProgressAfterForcedNavigation();
  armRouteReady();
  void browser.runtime.sendMessage({ type: "badge:refresh" });
}
