const PLAYBACK_END_THRESHOLD_SECONDS = 0.5;
const WATCH_CONTENT_INIT_KEY = "__niconiPlaylistWatchContentInitialized";
const ADVERTISEMENT_TITLE_FRAGMENT = "Advertisement";
const ADVERTISEMENT_SRC_PREFIX = "https://dcdn.cdn.nimg.jp/nicoad/instream/video";

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

function handlePause(event: Event) {
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

  console.log("NiconiPlaylist detected playback end.", {
    currentTime: target.currentTime,
    duration: target.duration,
    url: location.href,
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

  console.log("NiconiPlaylist content loaded.", { url: location.href });
}
