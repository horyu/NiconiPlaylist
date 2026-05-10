import { browser } from "wxt/browser";

import completionSoundPath from "@/assets/ui-soft-glass-ping.m4a";
import { buildWatchUrl } from "@/lib/nicovideoUrl";
import { shouldRepeatCurrentVideo } from "@/lib/playlistLoop";
import { playRepeatedAudio } from "@/lib/playRepeatedAudio";
import type { PlaybackCompletionSettings } from "@/lib/types";
import type { WatchPlaybackContextResponse } from "@/lib/watchMessages";

const PLAYBACK_END_THRESHOLD_SECONDS = 1;
const WATCH_CONTENT_INIT_KEY = "__niconiPlaylistWatchContentInitialized";
const WATCH_LOCATION_OBSERVER_KEY = "__niconiPlaylistWatchLocationObserverInitialized";
const ADVERTISEMENT_TITLE_FRAGMENT = "Advertisement";
const ADVERTISEMENT_SRC_PREFIX = "https://dcdn.cdn.nimg.jp/nicoad/instream/video";
const CURRENT_TIME_SLIDER_SELECTOR = '[aria-label="video - currentTime"][role="slider"]';
const WATCH_VIDEO_ID_PATH_PATTERN = /^\/watch\/((sm|so|nm|ss)[1-9][0-9]{0,8})$/u;
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
let currentLoopVideoId: string | null = null;
let completedPlaybackCount = 0;

function resetLoopProgress(videoId: string | null): void {
  currentLoopVideoId = videoId;
  completedPlaybackCount = 0;
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

function navigateToNextVideo(nextVideoId: string): void {
  const nextVideoUrl = buildWatchUrl(nextVideoId);
  void browser.runtime.sendMessage({
    type: "watch:navigate-next-video",
    url: nextVideoUrl,
  });
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
    syncPlaybackContextIfNeeded();
  });
  void browser.runtime.sendMessage({
    type: "watch:init-location-observer",
  });
}

async function handlePause(event: Event) {
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

  const playbackState = await resolveNextVideo(videoId);
  const nextCompletedPlaybackCount =
    currentLoopVideoId === videoId ? completedPlaybackCount + 1 : 1;

  if (
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
    if (playbackState?.playbackSettings && !playbackState.playbackSettings.playlistRepeatEnabled) {
      await handlePlaylistCompleted(playbackState);
    }
    void browser.runtime.sendMessage({
      type: "watch:clear-playback-context",
    });
  }
}

export function initWatchContent() {
  const state = globalThis as typeof globalThis & {
    [WATCH_CONTENT_INIT_KEY]?: boolean;
  };

  if (state[WATCH_CONTENT_INIT_KEY]) {
    return;
  }

  state[WATCH_CONTENT_INIT_KEY] = true;
  document.addEventListener("pause", handlePause, true);
  initWatchLocationObserver();
  syncPlaybackContextIfNeeded();
  void browser.runtime.sendMessage({ type: "badge:refresh" });
}
