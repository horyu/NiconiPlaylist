import { createEffect, createSignal, For, Show } from "solid-js";

import type { VideoId } from "@/lib/types";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type PlaylistDetailVideoRow = {
  originalIndex: number | null;
  rowId: string;
  videoId: VideoId;
};

type PlaylistDetailVideoListProps = {
  currentPlaybackIndex?: number | null;
  isEditing?: boolean;
  onMoveVideo?: (rowId: string, direction: "up" | "down") => void;
  onSetVideoDeleted?: (rowId: string, isDeleted: boolean) => void;
  resetKey?: number;
  videoRows: PlaylistDetailVideoRow[];
  videoMetadataState: VideoMetadataState | undefined;
};

type EditableVideoRowProps = {
  canMoveDown?: boolean;
  canMoveUp?: boolean;
  currentPlaybackIndex?: number | null;
  duration?: number | null;
  index: () => number;
  isEditing?: boolean;
  onMove?: (rowId: string, direction: "up" | "down") => void;
  onSetDeleted?: (rowId: string, isDeleted: boolean) => void;
  ownerName?: string | null;
  originalIndex: number | null;
  resetKey?: number;
  rowId: string;
  thumbnailUrl?: string | null;
  title?: string;
  videoId: VideoId;
};

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function EditableVideoRow(props: EditableVideoRowProps) {
  const [isDeleted, setIsDeleted] = createSignal(false);
  const isCurrent = () =>
    props.currentPlaybackIndex !== null && props.currentPlaybackIndex === props.originalIndex;

  createEffect(() => {
    const resetKey = props.resetKey;

    if (resetKey !== undefined) {
      setIsDeleted(false);
    }
  });

  function handleToggleDeleted() {
    const nextIsDeleted = !isDeleted();

    setIsDeleted(nextIsDeleted);
    props.onSetDeleted?.(props.rowId, nextIsDeleted);
  }

  function handleMove(direction: "up" | "down") {
    props.onMove?.(props.rowId, direction);
  }

  return (
    <li
      class={`flex items-start gap-3 rounded-xl border p-3 ${
        isDeleted()
          ? "border-red-500/30 bg-red-500/5 opacity-70"
          : isCurrent()
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-stone-800 bg-stone-950/40"
      }`}
    >
      <div class="flex w-8 shrink-0 flex-col items-center pt-1 text-center">
        <span
          class={`text-sm font-semibold ${
            isCurrent() && !isDeleted() ? "text-emerald-200" : "text-stone-400"
          }`}
        >
          {props.index() + 1}
        </span>
        <Show when={isCurrent()}>
          <span class="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300">
            NOW
          </span>
        </Show>
      </div>

      <a
        href={`https://www.nicovideo.jp/watch/${props.videoId}`}
        target="_blank"
        rel="noreferrer"
        class="h-14 w-24 overflow-hidden rounded-lg bg-stone-900"
      >
        <Show when={props.thumbnailUrl}>
          {(thumbnailUrl) => <img src={thumbnailUrl()} alt="" class="h-full w-full object-cover" />}
        </Show>
      </a>

      <div class="min-w-0 flex-1 space-y-1">
        <p
          class={`truncate text-sm font-medium ${isDeleted() ? "text-red-100" : "text-stone-100"}`}
        >
          {props.title ?? props.videoId}
        </p>
        <p class="text-xs text-stone-400">{props.videoId}</p>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{formatDuration(props.duration)}</span>
          <Show when={props.ownerName}>{(ownerName) => <span>{ownerName()}</span>}</Show>
        </div>
      </div>

      <Show when={props.isEditing}>
        <div class="shrink-0 space-y-2">
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-700 text-xs text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
              onClick={() => handleMove("up")}
              disabled={!props.canMoveUp}
              title="上へ移動"
              aria-label="上へ移動"
            >
              ↑
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-700 text-xs text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
              onClick={() => handleMove("down")}
              disabled={!props.canMoveDown}
              title="下へ移動"
              aria-label="下へ移動"
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            class={`w-[5.75rem] rounded-full border px-3 py-1 text-center text-xs font-medium transition ${
              isDeleted()
                ? "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                : "border-red-500/40 text-red-200 hover:bg-red-500/10"
            }`}
            onClick={handleToggleDeleted}
          >
            {isDeleted() ? "削除取消" : "削除"}
          </button>
        </div>
      </Show>
    </li>
  );
}

export function PlaylistDetailVideoList(props: PlaylistDetailVideoListProps) {
  const reorderHelpText = () =>
    props.isEditing
      ? "編集中は各動画を削除・上下移動できます。"
      : "将来的に追加・並び替えをここへ集約します。";

  return (
    <div
      class="space-y-3"
      style={{
        "content-visibility": "auto",
        "contain-intrinsic-size": "50vh",
      }}
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-medium text-stone-100">動画一覧</p>
        <p class="text-xs text-stone-500">{reorderHelpText()}</p>
      </div>

      <ul class="space-y-2">
        <For each={props.videoRows}>
          {(videoRow, index) => {
            const videoMetadata = () =>
              props.videoMetadataState?.videoMetadataMap[videoRow.videoId];
            const ownerName = () => {
              const ownerId = videoMetadata()?.ownerId;
              return ownerId ? props.videoMetadataState?.ownersMap[ownerId]?.name : undefined;
            };

            return (
              <EditableVideoRow
                canMoveDown={index() < props.videoRows.length - 1}
                canMoveUp={index() > 0}
                currentPlaybackIndex={props.currentPlaybackIndex}
                index={index}
                originalIndex={videoRow.originalIndex}
                rowId={videoRow.rowId}
                videoId={videoRow.videoId}
                title={videoMetadata()?.title}
                duration={videoMetadata()?.duration}
                thumbnailUrl={
                  videoMetadata()?.thumbnail.listingUrl ?? videoMetadata()?.thumbnail.url
                }
                ownerName={ownerName()}
                isEditing={props.isEditing}
                onMove={props.onMoveVideo}
                resetKey={props.resetKey}
                onSetDeleted={props.onSetVideoDeleted}
              />
            );
          }}
        </For>
      </ul>
    </div>
  );
}
