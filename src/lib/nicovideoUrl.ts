import type { VideoId } from "@/lib/types";

const NICOVIDEO_WATCH_BASE_URL = "https://www.nicovideo.jp/watch/";

export function buildWatchUrl(videoId: VideoId): string {
  return `${NICOVIDEO_WATCH_BASE_URL}${videoId}?from=0`;
}

export function buildWatchUrlWithoutFrom(videoId: VideoId): string {
  return `${NICOVIDEO_WATCH_BASE_URL}${videoId}`;
}

export function isWatchUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith(NICOVIDEO_WATCH_BASE_URL);
}
