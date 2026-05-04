import { createEffect, For, on, Show } from "solid-js";

import type { Playlist } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatIndex(index: number): string {
  return (index + 1).toString();
}

type PopupPlaylistVideoListProps = {
  autoScrollKey: string | null;
  currentPlaybackIndex: number | null;
  hasPlaybackTab: boolean;
  manualScrollRequestKey: number;
  onFocusPlaybackTab: () => void;
  onMovePlaybackIndex: (index: number) => void;
  ownersMap: Record<string, OwnerMetadata>;
  playlist: Playlist;
  videoMetadataMap: Record<string, VideoMetadata>;
};

export function PopupPlaylistVideoList(props: PopupPlaylistVideoListProps) {
  let videoListElement: HTMLUListElement | undefined;
  const videoItemElements: Array<HTMLLIElement | undefined> = [];

  function scrollToPlaybackIndex(playbackIndex: number) {
    if (!videoListElement) {
      return;
    }

    const targetIndex = Math.max(playbackIndex - 2, 0);

    requestAnimationFrame(() => {
      const targetElement = videoItemElements[targetIndex];

      if (!videoListElement || !targetElement || !videoListElement.contains(targetElement)) {
        return;
      }

      const listRect = videoListElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();
      const delta = targetRect.top - listRect.top;

      videoListElement.scrollTop += delta;
    });
  }

  createEffect(
    on(
      () => props.autoScrollKey,
      (scrollKey) => {
        if (!scrollKey || props.currentPlaybackIndex === null) {
          return;
        }

        scrollToPlaybackIndex(props.currentPlaybackIndex);
      },
    ),
  );

  createEffect(
    on(
      () => props.manualScrollRequestKey,
      (requestKey) => {
        if (requestKey === 0 || props.currentPlaybackIndex === null) {
          return;
        }

        scrollToPlaybackIndex(props.currentPlaybackIndex);
      },
    ),
  );

  return (
    <ul
      ref={(element) => {
        videoListElement = element;
      }}
      class="max-h-[32rem] space-y-2 overflow-y-auto pr-1"
    >
      <For each={props.playlist.videoIds}>
        {(videoId, index) => {
          const videoMetadata = () => props.videoMetadataMap[videoId];
          const ownerMetadata = () => {
            const ownerId = videoMetadata()?.ownerId;
            return ownerId ? props.ownersMap[ownerId] : undefined;
          };
          const isCurrent = () => props.currentPlaybackIndex === index();
          const showPlaybackButton = () => !isCurrent() || !props.hasPlaybackTab;
          const canFocusPlaybackTab = () => isCurrent() && props.hasPlaybackTab;

          return (
            <li
              ref={(element) => {
                videoItemElements[index()] = element;
              }}
              class={`flex items-start gap-3 rounded-xl border p-3 transition ${
                isCurrent()
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-stone-800 bg-stone-900/40"
              }`}
            >
              <div class="flex w-8 shrink-0 flex-col items-center pt-1 text-center">
                <span
                  class={`text-sm font-semibold ${
                    isCurrent() ? "text-emerald-200" : "text-stone-300"
                  }`}
                >
                  {formatIndex(index())}
                </span>
                <Show when={isCurrent()}>
                  <span class="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                    now
                  </span>
                </Show>
              </div>

              <a
                href={`https://www.nicovideo.jp/watch/${videoId}`}
                target="_blank"
                rel="noreferrer"
                class="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-stone-900"
              >
                <Show
                  when={videoMetadata()?.thumbnail.listingUrl ?? videoMetadata()?.thumbnail.url}
                >
                  {(thumbnailUrl) => (
                    <img src={thumbnailUrl()} alt="" class="h-full w-full object-cover" />
                  )}
                </Show>
              </a>

              <div class="min-w-0 flex-1 space-y-1">
                <p class="truncate text-sm font-medium text-stone-100">
                  {videoMetadata()?.title ?? videoId}
                </p>
                <p class="text-xs text-stone-400">{videoId}</p>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                  <span>{formatDuration(videoMetadata()?.duration)}</span>
                  <Show when={ownerMetadata()?.name}>
                    {(ownerName) => <span>{ownerName()}</span>}
                  </Show>
                </div>
              </div>

              <div class="shrink-0">
                <Show
                  when={showPlaybackButton()}
                  fallback={
                    <Show
                      when={canFocusPlaybackTab()}
                      fallback={
                        <div class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200">
                          ●
                        </div>
                      }
                    >
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                        title="再生中のタブをフォーカス"
                        aria-label="再生中のタブをフォーカス"
                        onClick={() => props.onFocusPlaybackTab()}
                      >
                        ●
                      </button>
                    </Show>
                  }
                >
                  <button
                    type="button"
                    class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-600 text-sm text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                    title="ここから再生"
                    aria-label="ここから再生"
                    onClick={() => props.onMovePlaybackIndex(index())}
                  >
                    ▶
                  </button>
                </Show>
              </div>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
