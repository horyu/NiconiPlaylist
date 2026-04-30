import type { VideoId } from "@/lib/types";

export type OwnerId = string;

export type VideoThumbnail = {
  url: string | null;
  middleUrl: string | null;
  largeUrl: string | null;
  listingUrl: string | null;
  nHdUrl: string | null;
};

export type VideoMetadata = {
  watchId: VideoId;
  title: string;
  thumbnail: VideoThumbnail;
  duration: number | null;
  ownerId: OwnerId | null;
  fetchedAt: string;
};

export type OwnerMetadata = {
  id: OwnerId;
  name: string | null;
  type: string | null;
  iconUrl: string | null;
  fetchedAt: string;
};

export type DevVideoMetadataFoundRecord = {
  kind: "found";
  watchId: VideoId;
  title: string;
  thumbnail: VideoThumbnail;
  duration: number | null;
  owner: {
    id: OwnerId | null;
    name: string | null;
    type: string | null;
    iconUrl: string | null;
  };
};

export type DevVideoMetadataNotFoundRecord = {
  kind: "not_found";
  watchId: VideoId;
  reason: "NOT_FOUND";
};

export type DevVideoMetadataRecord = DevVideoMetadataFoundRecord | DevVideoMetadataNotFoundRecord;
