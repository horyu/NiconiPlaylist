import type { VideoId } from "@/lib/types";

const VIDEO_ID_EXTRACT_PATTERN = /(sm|so|nm|ss)[1-9][0-9]{0,8}/;
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

export function parseVideoIdInputLines(value: string): VideoId[] {
  const lines = value.split(/[\s,]+/u).filter(Boolean);

  if (lines.length === 0) {
    throw new Error("watch URL または動画IDを1件以上入力してください。");
  }

  return lines.map((line, index) => {
    try {
      return parseVideoIdInputLine(line);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "watch URL または動画IDを解析できません。";
      throw new Error(`${index + 1}行目: ${message}`);
    }
  });
}
