import { Show } from "solid-js";

import type { VideoId } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

type VideoListItemProps = {
  ownerMetadata?: OwnerMetadata;
  videoId: VideoId;
  videoMetadata?: VideoMetadata;
};

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function VideoListItem(props: VideoListItemProps) {
  return (
    <li class="flex items-start gap-3 rounded-xl border border-stone-800 bg-stone-950/40 p-3">
      <div class="h-14 w-24 overflow-hidden rounded-lg bg-stone-900">
        <Show
          when={props.videoMetadata?.thumbnail.listingUrl ?? props.videoMetadata?.thumbnail.url}
        >
          {(thumbnailUrl) => <img src={thumbnailUrl()} alt="" class="h-full w-full object-cover" />}
        </Show>
      </div>

      <div class="min-w-0 flex-1 space-y-1">
        <p class="truncate text-sm font-medium text-stone-100">
          {props.videoMetadata?.title ?? props.videoId}
        </p>
        <p class="text-xs text-stone-400">{props.videoId}</p>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{formatDuration(props.videoMetadata?.duration)}</span>
          <Show when={props.ownerMetadata?.name}>{(ownerName) => <span>{ownerName()}</span>}</Show>
        </div>
      </div>
    </li>
  );
}
