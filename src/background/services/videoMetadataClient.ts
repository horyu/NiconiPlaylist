import type { VideoId } from "@/lib/types";
import type { DevVideoMetadataRecord } from "@/lib/videoMetadataTypes";

export async function fetchNvapiVideoMetadata(watchId: VideoId): Promise<DevVideoMetadataRecord> {
  const response = await fetch(
    `https://nvapi.nicovideo.jp/v1/videos?watchIds=${encodeURIComponent(watchId)}`,
    {
      method: "GET",
      headers: {
        "x-Frontend-Id": "6",
        "x-Frontend-Version": "0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`動画情報の取得に失敗しました: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: {
      items?: Array<{
        watchId: string;
        video?: {
          title?: string;
          thumbnail?: {
            url?: string | null;
            middleUrl?: string | null;
            largeUrl?: string | null;
            listingUrl?: string | null;
            nHdUrl?: string | null;
          };
          duration?: number | null;
          owner?: {
            id?: string | null;
            name?: string | null;
            type?: string | null;
            iconUrl?: string | null;
          };
        };
      }>;
    };
  };
  const item = payload.data?.items?.find((candidate) => candidate.watchId === watchId);
  const video = item?.video;

  if (!video || typeof video.title !== "string") {
    return {
      kind: "not_found",
      watchId,
      reason: "NOT_FOUND",
    };
  }

  return {
    kind: "found",
    watchId,
    title: video.title,
    thumbnail: {
      url: video.thumbnail?.url ?? null,
      middleUrl: video.thumbnail?.middleUrl ?? null,
      largeUrl: video.thumbnail?.largeUrl ?? null,
      listingUrl: video.thumbnail?.listingUrl ?? null,
      nHdUrl: video.thumbnail?.nHdUrl ?? null,
    },
    duration: video.duration ?? null,
    owner: {
      id: video.owner?.id ?? null,
      name: video.owner?.name ?? null,
      type: video.owner?.type ?? null,
      iconUrl: video.owner?.iconUrl ?? null,
    },
  };
}
