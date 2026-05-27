import { createMemo, createSignal, For, Show } from "solid-js";

import type { VideoId } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type VideoPlaylistMembership = {
  playlistId: string;
  playlistTitle: string;
};

type VideoRow = {
  memberships: VideoPlaylistMembership[];
  ownerMetadata?: OwnerMetadata;
  videoId: VideoId;
  videoMetadata?: VideoMetadata;
};

type VideosTabProps = {
  error: unknown;
  loading: boolean;
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
};

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function compareVideoRows(left: VideoRow, right: VideoRow): number {
  const leftTitle = left.videoMetadata?.title ?? left.videoId;
  const rightTitle = right.videoMetadata?.title ?? right.videoId;
  const titleComparison = leftTitle.localeCompare(rightTitle, "ja");

  if (titleComparison !== 0) {
    return titleComparison;
  }

  return left.videoId.localeCompare(right.videoId, "ja");
}

function buildVideoRows(
  playlistsState: PlaylistsState | undefined,
  videoMetadataState: VideoMetadataState | undefined,
): VideoRow[] {
  const playlists = playlistsState?.playlists ?? [];
  const videoMetadataMap = videoMetadataState?.videoMetadataMap ?? {};
  const ownersMap = videoMetadataState?.ownersMap ?? {};
  const rowsByVideoId = new Map<VideoId, VideoRow>();

  for (const playlist of playlists) {
    const playlistTitle = playlist.title?.trim() || "(無題)";

    for (const videoId of playlist.videoIds) {
      const existingRow = rowsByVideoId.get(videoId);

      if (existingRow) {
        existingRow.memberships.push({
          playlistId: playlist.id,
          playlistTitle,
        });
        continue;
      }

      const videoMetadata = videoMetadataMap[videoId];
      const ownerMetadata =
        videoMetadata?.ownerId === null || videoMetadata?.ownerId === undefined
          ? undefined
          : ownersMap[videoMetadata.ownerId];

      rowsByVideoId.set(videoId, {
        memberships: [
          {
            playlistId: playlist.id,
            playlistTitle,
          },
        ],
        ownerMetadata,
        videoId,
        videoMetadata,
      });
    }
  }

  return [...rowsByVideoId.values()].sort(compareVideoRows);
}

export function VideosTab(props: VideosTabProps) {
  const [allExpanded, setAllExpanded] = createSignal(true);
  const [toggledVideoIds, setToggledVideoIds] = createSignal<Set<VideoId>>(new Set());
  const videoRows = createMemo(() => buildVideoRows(props.state, props.videoMetadataState));

  function isRowExpanded(videoId: VideoId): boolean {
    return allExpanded() ? !toggledVideoIds().has(videoId) : toggledVideoIds().has(videoId);
  }

  function toggleAllExpansions() {
    setAllExpanded((current) => !current);
    setToggledVideoIds(new Set<VideoId>());
  }

  function toggleVideoExpansion(videoId: VideoId) {
    setToggledVideoIds((current) => {
      const next = new Set(current);

      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }

      return next;
    });
  }

  return (
    <section class="space-y-6">
      <header class="space-y-1">
        <h2 class="text-lg font-semibold text-stone-50">動画</h2>
        <p class="text-sm text-stone-400">
          保存済みプレイリストに含まれる動画を、playlist 横断で一覧表示します。
        </p>
      </header>

      <Show when={props.error}>
        {(error) => (
          <div class="rounded-2xl border border-rose-900/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
            動画一覧を取得できませんでした。
            <Show when={error()}>
              <span class="ml-2 text-rose-300/80">{String(error())}</span>
            </Show>
          </div>
        )}
      </Show>

      <div class="rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 pb-4">
          <button
            type="button"
            onClick={toggleAllExpansions}
            disabled={videoRows().length === 0}
            class="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
          >
            {allExpanded() ? "プレイリストを全て折りたたむ" : "プレイリストを全て展開"}
          </button>
          <p class="text-sm text-stone-400">
            <span class="font-medium text-stone-200">{videoRows().length}</span> 件
          </p>
        </div>

        <Show
          when={!props.loading}
          fallback={<p class="py-6 text-sm text-stone-500">読み込み中...</p>}
        >
          <Show
            when={videoRows().length > 0}
            fallback={<p class="py-6 text-sm text-stone-500">表示できる動画がありません。</p>}
          >
            <div class="overflow-x-auto pt-4">
              <table class="min-w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-stone-800">
                <thead class="bg-stone-900/80">
                  <tr class="text-left text-xs uppercase tracking-[0.18em] text-stone-500">
                    <th class="w-16 px-4 py-3 font-medium">#</th>
                    <th class="w-28 px-4 py-3 font-medium">サムネ</th>
                    <th class="px-4 py-3 font-medium">タイトル</th>
                    <th class="w-24 px-4 py-3 font-medium">時間</th>
                    <th class="w-32 px-4 py-3 font-medium">watchId</th>
                    <th class="w-36 px-4 py-3 font-medium">投稿者</th>
                    <th class="w-80 px-4 py-3 font-medium">playlist</th>
                  </tr>
                </thead>
                <tbody class="bg-stone-950/40">
                  <For each={videoRows()}>
                    {(row, index) => {
                      const thumbnailUrl =
                        row.videoMetadata?.thumbnail.listingUrl ?? row.videoMetadata?.thumbnail.url;

                      return (
                        <tr class="align-top text-sm text-stone-200">
                          <td class="border-t border-stone-800 px-4 py-4 text-xs font-medium text-stone-500">
                            #{index() + 1}
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4">
                            <a
                              href={`https://www.nicovideo.jp/watch/${row.videoId}`}
                              target="_blank"
                              rel="noreferrer"
                              class="flex h-16 w-24 items-center justify-center overflow-hidden rounded-xl bg-stone-900 text-[11px] text-stone-500 transition hover:bg-stone-800"
                            >
                              <Show when={thumbnailUrl} fallback={<span>{row.videoId}</span>}>
                                {(resolvedThumbnailUrl) => (
                                  <img
                                    src={resolvedThumbnailUrl()}
                                    alt=""
                                    class="h-full w-full object-cover"
                                  />
                                )}
                              </Show>
                            </a>
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4">
                            <p class="line-clamp-2 font-medium text-stone-100">
                              {row.videoMetadata?.title ?? "未取得"}
                            </p>
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4 text-xs text-stone-500">
                            {formatDuration(row.videoMetadata?.duration)}
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4 text-xs text-stone-400">
                            {row.videoId}
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4 text-xs text-stone-400">
                            {row.ownerMetadata?.name ?? "-"}
                          </td>
                          <td class="border-t border-stone-800 px-4 py-4">
                            <div class="space-y-2">
                              <button
                                type="button"
                                onClick={() => toggleVideoExpansion(row.videoId)}
                                class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                              >
                                {isRowExpanded(row.videoId)
                                  ? `playlist ${row.memberships.length}件を折りたたむ`
                                  : `playlist ${row.memberships.length}件を表示`}
                              </button>
                              <Show when={isRowExpanded(row.videoId)}>
                                <ul class="space-y-2">
                                  <For each={row.memberships}>
                                    {(membership) => (
                                      <li class="rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-xs text-stone-300">
                                        {membership.playlistTitle}
                                      </li>
                                    )}
                                  </For>
                                </ul>
                              </Show>
                            </div>
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </div>
    </section>
  );
}
