import { fetchNvapiVideoMetadata } from "@/background/services/videoMetadataClient";
import { loadDevVideoMetadataRecord } from "@/background/services/videoMetadataDevSource";
import type { VideoId } from "@/lib/types";
import type {
  DevVideoMetadataRecord,
  OwnerMetadata,
  VideoMetadata,
} from "@/lib/videoMetadataTypes";

import {
  getStoredOwnersMap,
  getStoredVideoMetadataMap,
  setStoredOwnersMap,
  setStoredVideoMetadataMap,
} from "./videoMetadataStore";

const METADATA_FETCH_INTERVAL_MS = 500;
const queuedVideoIds = new Set<VideoId>();
let isProcessingQueue = false;

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

async function loadVideoMetadataRecord(watchId: VideoId): Promise<DevVideoMetadataRecord> {
  if (import.meta.env.DEV) {
    return loadDevVideoMetadataRecord(watchId);
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
