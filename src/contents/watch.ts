import { browser } from "wxt/browser";

import completionSoundPath from "@/assets/ui-soft-glass-ping.m4a";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import { shouldRepeatCurrentVideo } from "@/lib/playlistLoop";
import { playRepeatedAudio } from "@/lib/playRepeatedAudio";
import type { PlaybackCompletionSettings } from "@/lib/types";
import type { WatchPlaybackContextResponse } from "@/lib/watchMessages";

const PLAYBACK_END_THRESHOLD_SECONDS = 1;
const PLAYBACK_END_DEDUPLICATION_WINDOW_MS = 5_000;
const ROUTE_READY_DELAY_MS = 50;
const WATCH_CONTENT_INIT_KEY = "__niconiPlaylistWatchContentInitialized";
const WATCH_LOCATION_OBSERVER_KEY = "__niconiPlaylistWatchLocationObserverInitialized";
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
let routeReadyArmed = false;
let routeReadySawFromZero = false;
let routeReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;
let currentLoopVideoId: string | null = null;
let completedPlaybackCount = 0;
let expectedNextVideoId: string | null = null;
let lastHandledPlaybackEnd: {
  at: number;
  eventType: "pause" | "ended";
  signature: string;
} | null = null;

function clearExpectedNextVideo(): void {
  expectedNextVideoId = null;
}

function setExpectedNextVideo(nextVideoId: string): void {
  clearExpectedNextVideo();
  expectedNextVideoId = nextVideoId;
}

function resetLoopProgress(videoId: string | null): void {
  currentLoopVideoId = videoId;
  completedPlaybackCount = 0;
}

function buildPlaybackEndSignature(videoId: string, video: HTMLVideoElement): string {
  return [
    videoId,
    video.currentSrc || video.src,
    Math.round(video.currentTime * 1000),
    Math.round(video.duration * 1000),
  ].join("|");
}

function shouldSkipDuplicatePlaybackEnd(eventType: "pause" | "ended", signature: string): boolean {
  const now = Date.now();

  if (
    lastHandledPlaybackEnd !== null &&
    lastHandledPlaybackEnd.signature === signature &&
    lastHandledPlaybackEnd.eventType !== eventType &&
    now - lastHandledPlaybackEnd.at <= PLAYBACK_END_DEDUPLICATION_WINDOW_MS
  ) {
    return true;
  }

  lastHandledPlaybackEnd = {
    at: now,
    eventType,
    signature,
  };
  return false;
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
  if (!routeReadyArmed) {
    console.log("NiconiPlaylist route-ready skipped because it is not armed.");
    return;
  }

  routeReadyArmed = false;
  if (routeReadyTimeoutId !== null) {
    clearTimeout(routeReadyTimeoutId);
  }

  console.log("NiconiPlaylist route-ready scheduled after timeout.", {
    delayMs: ROUTE_READY_DELAY_MS,
    expectedNextVideoId,
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

  routeReadyArmed = true;
  routeReadySawFromZero = hasFromZeroSearchParam();
  console.log("NiconiPlaylist route-ready armed.", {
    expectedNextVideoId,
    hasFromZeroSearchParam: routeReadySawFromZero,
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

function forceNavigateToExpectedNextVideo(): void {
  if (!expectedNextVideoId) {
    return;
  }

  const expectedNextVideoUrl = buildWatchUrl(expectedNextVideoId);
  if (location.href === expectedNextVideoUrl) {
    return;
  }

  console.warn("NiconiPlaylist detected unexpected next video and is forcing navigation.", {
    currentVideoId: getCurrentWatchVideoId(),
    currentUrl: location.href,
    expectedNextVideoId,
    expectedNextVideoUrl,
  });
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
    let handledAsRouteReady = false;
    console.log("NiconiPlaylist observed location change.", {
      currentVideoId,
      expectedNextVideoId,
      hasFromZeroSearchParam: hasFromZero,
      pathname: location.pathname,
      href: location.href,
    });

    if (expectedNextVideoId !== null && currentVideoId !== expectedNextVideoId) {
      forceNavigateToExpectedNextVideo();
      return;
    }

    if (
      routeReadyArmed &&
      routeReadySawFromZero &&
      !hasFromZero &&
      (expectedNextVideoId === null || currentVideoId === expectedNextVideoId)
    ) {
      console.log("NiconiPlaylist treating canonical URL change as route-ready.", {
        expectedNextVideoId,
        currentVideoId,
        pathname: location.pathname,
        href: location.href,
      });
      sendRouteReady();
      handledAsRouteReady = true;
    }

    syncPlaybackContextIfNeeded();
    if (handledAsRouteReady) {
      return;
    }
    armRouteReady();
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

  if (shouldSkipDuplicatePlaybackEnd(eventType, playbackEndSignature)) {
    console.log("NiconiPlaylist skipped duplicate playback end handling.", {
      eventType,
      playbackEndSignature,
      videoId,
    });
    return;
  }

  const playbackState = await resolveNextVideo(videoId);
  const hasPlaybackContext =
    playbackState?.playbackContext !== null && playbackState?.playbackContext !== undefined;
  const nextCompletedPlaybackCount =
    currentLoopVideoId === videoId ? completedPlaybackCount + 1 : 1;

  if (
    !playbackState?.forceSkipCurrentVideoRepeat &&
    hasPlaybackContext &&
    playbackState?.playbackSettings &&
    shouldRepeatCurrentVideo(
      playbackState.playbackSettings,
      nextCompletedPlaybackCount,
      target.duration,
    )
  ) {
    currentLoopVideoId = videoId;
    completedPlaybackCount = nextCompletedPlaybackCount;
    restartCurrentVideo();
    return;
  }

  resetLoopProgress(null);
  if (playbackState?.nextVideoId) {
    navigateToNextVideo(playbackState.nextVideoId);
  } else {
    clearExpectedNextVideo();
    if (
      hasPlaybackContext &&
      playbackState?.playbackSettings &&
      !playbackState.playbackSettings.playlistRepeatEnabled
    ) {
      await handlePlaylistCompleted(playbackState);
    }
    await browser.runtime.sendMessage({
      type: "watch:clear-playback-context",
      markCompleted: Boolean(
        hasPlaybackContext &&
        playbackState?.playbackSettings !== null &&
        playbackState?.playbackSettings !== undefined &&
        !playbackState.playbackSettings.playlistRepeatEnabled,
      ),
    });
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
  armRouteReady();
  void browser.runtime.sendMessage({ type: "badge:refresh" });
}
