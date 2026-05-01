import type { VideoId } from "@/lib/types";
import type {
  DevVideoMetadataRecord,
  OwnerMetadata,
  VideoMetadata,
  VideoThumbnail,
} from "@/lib/videoMetadataTypes";

import {
  getStoredOwnersMap,
  getStoredVideoMetadataMap,
  setStoredOwnersMap,
  setStoredVideoMetadataMap,
} from "./videoMetadataStore";

type DevFoundOwner = Extract<DevVideoMetadataRecord, { kind: "found" }>["owner"];
const METADATA_FETCH_INTERVAL_MS = 500;
const queuedVideoIds = new Set<VideoId>();
let isProcessingQueue = false;

function isThumbnail(value: unknown): value is VideoThumbnail {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.url === null || typeof candidate.url === "string") &&
    (candidate.middleUrl === null || typeof candidate.middleUrl === "string") &&
    (candidate.largeUrl === null || typeof candidate.largeUrl === "string") &&
    (candidate.listingUrl === null || typeof candidate.listingUrl === "string") &&
    (candidate.nHdUrl === null || typeof candidate.nHdUrl === "string")
  );
}

function isOwner(value: unknown): value is DevFoundOwner {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate.id === null || typeof candidate.id === "string") &&
    (candidate.name === null || typeof candidate.name === "string") &&
    (candidate.type === null || typeof candidate.type === "string") &&
    (candidate.iconUrl === null || typeof candidate.iconUrl === "string")
  );
}

function parseDevVideoMetadataRecord(value: unknown): DevVideoMetadataRecord {
  if (!value || typeof value !== "object") {
    throw new Error("開発用動画メタデータ JSON の形式が不正です。");
  }

  const candidate = value as Record<string, unknown>;

  if (
    candidate.kind === "found" &&
    typeof candidate.watchId === "string" &&
    typeof candidate.title === "string" &&
    isThumbnail(candidate.thumbnail) &&
    (candidate.duration === null || typeof candidate.duration === "number") &&
    isOwner(candidate.owner)
  ) {
    const thumbnail = candidate.thumbnail;
    const owner = candidate.owner;

    return {
      kind: "found",
      watchId: candidate.watchId,
      title: candidate.title,
      thumbnail,
      duration: candidate.duration,
      owner,
    };
  }

  if (
    candidate.kind === "not_found" &&
    typeof candidate.watchId === "string" &&
    candidate.reason === "NOT_FOUND"
  ) {
    return {
      kind: "not_found",
      watchId: candidate.watchId,
      reason: "NOT_FOUND",
    };
  }

  throw new Error("開発用動画メタデータ JSON の形式が不正です。");
}

const DEV_VIDEO_METADATA_LOADERS: Record<VideoId, () => Promise<unknown>> = {
  sm9: () => import("@/dev-data/video-metadata/sm9.json").then((module) => module.default),
  so5364283: () =>
    import("@/dev-data/video-metadata/so5364283.json").then((module) => module.default),
  nm2829323: () =>
    import("@/dev-data/video-metadata/nm2829323.json").then((module) => module.default),
  ss46168863: () =>
    import("@/dev-data/video-metadata/ss46168863.json").then((module) => module.default),
  sm1: () => import("@/dev-data/video-metadata/sm1.json").then((module) => module.default),
};

function isKnownVideoIdFormat(watchId: VideoId): boolean {
  return /^(sm|so|nm|ss)[1-9][0-9]{0,8}$/.test(watchId);
}

function createSyntheticDevVideoMetadataRecord(watchId: VideoId): DevVideoMetadataRecord {
  return {
    kind: "found",
    watchId,
    title: `${watchId} (DEV)`,
    thumbnail: {
      url: "https://resource.video.nimg.jp/web/img/common/video_deleted.jpg?_t=20181018",
      middleUrl: "https://resource.video.nimg.jp/web/img/common/video_deleted_M.jpg?_t=20190301",
      largeUrl: "https://resource.video.nimg.jp/web/img/common/video_deleted_L.jpg?_t=20190301",
      listingUrl: "https://resource.video.nimg.jp/web/img/common/video_deleted_M.jpg?_t=20190301",
      nHdUrl: "https://resource.video.nimg.jp/web/img/common/video_deleted_360p.jpg?_t=20200610",
    },
    duration: null,
    owner: {
      id: null,
      name: "DEV",
      type: "dev",
      iconUrl: null,
    },
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function toStoredRecords(
  record: Extract<DevVideoMetadataRecord, { kind: "found" }>,
  fetchedAt: string,
): { videoMetadata: VideoMetadata; ownerMetadata: OwnerMetadata | null } {
  const ownerId = record.owner.id;

  return {
    videoMetadata: {
      watchId: record.watchId,
      title: record.title,
      thumbnail: record.thumbnail,
      duration: record.duration,
      ownerId,
      fetchedAt,
    },
    ownerMetadata:
      ownerId === null
        ? null
        : {
            id: ownerId,
            name: record.owner.name,
            type: record.owner.type,
            iconUrl: record.owner.iconUrl,
            fetchedAt,
          },
  };
}

async function fetchNvapiVideoMetadata(watchId: VideoId): Promise<DevVideoMetadataRecord> {
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

async function loadVideoMetadataRecord(watchId: VideoId): Promise<DevVideoMetadataRecord> {
  if (import.meta.env.DEV) {
    const loader = DEV_VIDEO_METADATA_LOADERS[watchId];

    if (loader) {
      const rawRecord = await loader();
      return parseDevVideoMetadataRecord(rawRecord);
    }

    if (isKnownVideoIdFormat(watchId)) {
      return createSyntheticDevVideoMetadataRecord(watchId);
    }

    return {
      kind: "not_found",
      watchId,
      reason: "NOT_FOUND",
    };
  }

  return fetchNvapiVideoMetadata(watchId);
}

export async function ensureVideoMetadataForVideoIds(videoIds: VideoId[]): Promise<void> {
  enqueueVideoMetadataForVideoIds(videoIds);
}

async function processQueuedVideoMetadata(): Promise<void> {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  try {
    while (queuedVideoIds.size > 0) {
      const [videoId] = queuedVideoIds;
      queuedVideoIds.delete(videoId);

      const existingVideoMetadataMap = await getStoredVideoMetadataMap();

      if (existingVideoMetadataMap[videoId]) {
        continue;
      }

      const record = await loadVideoMetadataRecord(videoId);

      if (record.kind === "found") {
        const [videoMetadataMap, ownersMap] = await Promise.all([
          getStoredVideoMetadataMap(),
          getStoredOwnersMap(),
        ]);
        const fetchedAt = new Date().toISOString();
        const stored = toStoredRecords(record, fetchedAt);

        await setStoredVideoMetadataMap({
          ...videoMetadataMap,
          [videoId]: stored.videoMetadata,
        });

        if (stored.ownerMetadata) {
          await setStoredOwnersMap({
            ...ownersMap,
            [stored.ownerMetadata.id]: stored.ownerMetadata,
          });
        }
      }

      if (queuedVideoIds.size > 0) {
        await sleep(METADATA_FETCH_INTERVAL_MS);
      }
    }
  } finally {
    isProcessingQueue = false;

    if (queuedVideoIds.size > 0) {
      void processQueuedVideoMetadata();
    }
  }
}

export function enqueueVideoMetadataForVideoIds(videoIds: VideoId[]): void {
  void getStoredVideoMetadataMap().then((videoMetadataMap) => {
    const uniqueVideoIds = videoIds.filter((videoId, index) => {
      return videoIds.indexOf(videoId) === index;
    });

    for (const videoId of uniqueVideoIds) {
      if (!videoMetadataMap[videoId]) {
        queuedVideoIds.add(videoId);
      }
    }

    void processQueuedVideoMetadata();
  });
}
