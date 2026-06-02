import type { VideoId } from "@/lib/types";

const VIDEO_ID_EXTRACT_PATTERN = /(sm|so|nm)[1-9][0-9]{0,8}/;
const VIDEO_ID_EXTRACT_GLOBAL_PATTERN = new RegExp(VIDEO_ID_EXTRACT_PATTERN.source, "gu");
const VIDEO_ID_PATTERN = new RegExp(`^${VIDEO_ID_EXTRACT_PATTERN.source}$`);

function parseWatchUrlVideoId(value: string): VideoId | null {
  const match = VIDEO_ID_EXTRACT_PATTERN.exec(value);
  return (match?.[0] ?? null) as VideoId | null;
}

export function isVideoId(value: string): value is VideoId {
  return VIDEO_ID_PATTERN.test(value);
}

export function parseVideoIdInputLine(value: string): VideoId {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("入力が空です。");
  }

  const watchVideoId = parseWatchUrlVideoId(trimmed);

  if (watchVideoId) {
    return watchVideoId;
  }

  throw new Error("watch URL または動画IDを入力してください。");
}

function extractVideoIds(value: string): VideoId[] {
  return Array.from(
    value.matchAll(VIDEO_ID_EXTRACT_GLOBAL_PATTERN),
    (match) => match[0] as VideoId,
  );
}

function dedupeConsecutiveVideoIds(videoIds: VideoId[]): VideoId[] {
  return videoIds.filter((videoId, index) => index === 0 || videoIds[index - 1] !== videoId);
}

function dedupeAllVideoIds(videoIds: VideoId[]): VideoId[] {
  const seen = new Set<VideoId>();
  return videoIds.filter((videoId) => {
    if (seen.has(videoId)) {
      return false;
    }
    seen.add(videoId);
    return true;
  });
}

export type ParseVideoIdInputOptions = {
  dedupe?: "none" | "consecutive" | "all";
};

export function parseVideoIdInputLines(
  value: string,
  options: ParseVideoIdInputOptions = {},
): VideoId[] {
  const extractedVideoIds = extractVideoIds(value);
  const dedupeMode = options.dedupe ?? "none";
  const videoIds =
    dedupeMode === "consecutive"
      ? dedupeConsecutiveVideoIds(extractedVideoIds)
      : dedupeMode === "all"
        ? dedupeAllVideoIds(extractedVideoIds)
        : extractedVideoIds;

  if (videoIds.length === 0) {
    throw new Error("watch URL または動画IDを1件以上入力してください。");
  }

  return videoIds;
}
