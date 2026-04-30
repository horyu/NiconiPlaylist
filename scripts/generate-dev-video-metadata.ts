import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO_IDS = ["sm9", "so5364283", "nm2829323", "ss46168863", "sm1"] as const;

type ApiPayload = {
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

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(rootDir, "src", "dev-data", "video-metadata");

async function fetchVideoMetadata(videoId: string) {
  const response = await fetch(
    `https://nvapi.nicovideo.jp/v1/videos?watchIds=${encodeURIComponent(videoId)}`,
    {
      method: "GET",
      headers: {
        "x-Frontend-Id": "6",
        "x-Frontend-Version": "0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`動画情報の取得に失敗しました: ${videoId} (${response.status})`);
  }

  const payload = (await response.json()) as ApiPayload;
  const item = payload.data?.items?.find((candidate) => candidate.watchId === videoId);
  const video = item?.video;

  if (!video || typeof video.title !== "string") {
    return {
      kind: "not_found",
      watchId: videoId,
      reason: "NOT_FOUND",
    };
  }

  return {
    kind: "found",
    watchId: videoId,
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

async function main() {
  await mkdir(outputDir, { recursive: true });

  for (const videoId of VIDEO_IDS) {
    const record = await fetchVideoMetadata(videoId);
    const filePath = join(outputDir, `${videoId}.json`);

    await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

await main();
