import type { VideoId } from "@/lib/types";
import type { DevVideoMetadataRecord, VideoThumbnail } from "@/lib/videoMetadataTypes";

type DevFoundOwner = Extract<DevVideoMetadataRecord, { kind: "found" }>["owner"];

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

export async function loadDevVideoMetadataRecord(
  watchId: VideoId,
): Promise<DevVideoMetadataRecord> {
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
