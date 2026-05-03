import { browser } from "wxt/browser";

import type { WatchPlaybackContextResponse } from "@/lib/watchMessages";

const PLAYBACK_END_THRESHOLD_SECONDS = 0.5;
const WATCH_CONTENT_INIT_KEY = "__niconiPlaylistWatchContentInitialized";
const ADVERTISEMENT_TITLE_FRAGMENT = "Advertisement";
const ADVERTISEMENT_SRC_PREFIX = "https://dcdn.cdn.nimg.jp/nicoad/instream/video";
const WATCH_VIDEO_ID_PATH_PATTERN = /^\/watch\/((sm|so|nm|ss)[1-9][0-9]{0,8})$/u;

function isVideoElement(target: EventTarget | null): target is HTMLVideoElement {
  return target instanceof HTMLVideoElement;
}

function isAdvertisementVideo(video: HTMLVideoElement): boolean {
  const title = video.title.trim();
  const src = video.currentSrc || video.src;

  return title.includes(ADVERTISEMENT_TITLE_FRAGMENT) || src.startsWith(ADVERTISEMENT_SRC_PREFIX);
}

function isPlaybackEndedByPause(video: HTMLVideoElement): boolean {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return false;
  }

  return video.duration - video.currentTime <= PLAYBACK_END_THRESHOLD_SECONDS;
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

function buildWatchUrl(videoId: string): string {
  return `${location.origin}/watch/${videoId}`;
}

function navigateToNextVideo(nextVideoId: string): void {
  const nextVideoUrl = buildWatchUrl(nextVideoId);
  location.href = nextVideoUrl;
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
  console.debug("NiconiPlaylist resolved next video.", {
    videoId,
    playbackState,
  });
  if (playbackState?.nextVideoId) {
    navigateToNextVideo(playbackState.nextVideoId);
  }

  console.log("NiconiPlaylist detected playback end.", {
    currentTime: target.currentTime,
    duration: target.duration,
    nextVideoId: playbackState?.nextVideoId ?? null,
    playbackContext: playbackState?.playbackContext ?? null,
    url: location.href,
    videoId,
  });
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

  const videoId = getCurrentWatchVideoId();

  if (videoId) {
    void syncPlaybackContext(videoId);
  }

  console.log("NiconiPlaylist content loaded.", { url: location.href });
}
