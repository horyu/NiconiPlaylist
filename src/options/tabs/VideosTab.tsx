import { createMemo, createSignal, For, Show } from "solid-js";

import { formatSlashTimestampWithSeconds } from "@/lib/dateTime";
import type { PlaylistId, VideoId } from "@/lib/types";
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
  onOpenPlaylist: (playlistId: PlaylistId) => void;
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
};

type VideoSortKey =
  | "duration"
  | "owner"
  | "playlist-count"
  | "registered-at"
  | "title"
  | "watch-id";
type SortOrder = "asc" | "desc";

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function formatRegisteredAt(registeredAt: string | null | undefined): string {
  if (!registeredAt) {
    return "-";
  }

  const date = new Date(registeredAt);

  if (Number.isNaN(date.getTime())) {
    return registeredAt;
  }

  return formatSlashTimestampWithSeconds(date);
}

function ClearableFilterInput(props: {
  list?: string;
  onClear: () => void;
  onInput: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div class="relative min-w-0">
      <input
        type="text"
        list={props.list}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        placeholder={props.placeholder}
        class="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-stone-600"
      />
      <Show when={props.value.trim() !== ""}>
        <button
          type="button"
          onClick={() => props.onClear()}
          class="absolute right-3.5 top-1/2 z-10 -translate-y-1/2 bg-stone-950 px-1 text-base leading-none text-stone-500 transition hover:text-stone-200"
          aria-label="入力をクリア"
        >
          ×
        </button>
      </Show>
    </div>
  );
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

function compareNullableNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  return left - right;
}

function compareNullableStrings(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  if (left === right) {
    return 0;
  }

  if (left === null || left === undefined) {
    return 1;
  }

  if (right === null || right === undefined) {
    return -1;
  }

  return left.localeCompare(right, "ja");
}

function compareBySortKey(left: VideoRow, right: VideoRow, sortKey: VideoSortKey): number {
  switch (sortKey) {
    case "title":
      return compareVideoRows(left, right);
    case "watch-id":
      return left.videoId.localeCompare(right.videoId, "ja") || compareVideoRows(left, right);
    case "owner":
      return (
        (left.ownerMetadata?.name ?? "").localeCompare(right.ownerMetadata?.name ?? "", "ja") ||
        compareVideoRows(left, right)
      );
    case "playlist-count":
      return left.memberships.length - right.memberships.length || compareVideoRows(left, right);
    case "duration":
      return (
        compareNullableNumbers(left.videoMetadata?.duration, right.videoMetadata?.duration) ||
        compareVideoRows(left, right)
      );
    case "registered-at":
      return (
        compareNullableStrings(
          left.videoMetadata?.registeredAt,
          right.videoMetadata?.registeredAt,
        ) || compareVideoRows(left, right)
      );
  }
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
        if (!existingRow.memberships.some((membership) => membership.playlistId === playlist.id)) {
          existingRow.memberships.push({
            playlistId: playlist.id,
            playlistTitle,
          });
        }
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
  const [sortKey, setSortKey] = createSignal<VideoSortKey>("title");
  const [sortOrder, setSortOrder] = createSignal<SortOrder>("asc");
  const [titleQuery, setTitleQuery] = createSignal("");
  const [watchIdQuery, setWatchIdQuery] = createSignal("");
  const [ownerQuery, setOwnerQuery] = createSignal("");
  const [playlistQuery, setPlaylistQuery] = createSignal("");
  const [toggledVideoIds, setToggledVideoIds] = createSignal<Set<VideoId>>(new Set());
  const videoRows = createMemo(() => buildVideoRows(props.state, props.videoMetadataState));
  const ownerOptions = createMemo(() =>
    [
      ...new Set(
        videoRows()
          .map((row) => row.ownerMetadata?.name?.trim())
          .filter((name): name is string => Boolean(name && name.length > 0)),
      ),
    ].sort((left, right) => left.localeCompare(right, "ja")),
  );
  const playlistOptions = createMemo(() =>
    [
      ...new Set(
        (props.state?.playlists ?? [])
          .map((playlist) => playlist.title?.trim() || "(無題)")
          .filter((title): title is string => title.length > 0),
      ),
    ].sort((left, right) => left.localeCompare(right, "ja")),
  );
  const filteredVideoRows = createMemo(() => {
    const normalizedTitleQuery = titleQuery().trim().toLocaleLowerCase();
    const normalizedWatchIdQuery = watchIdQuery().trim().toLocaleLowerCase();
    const normalizedOwnerQuery = ownerQuery().trim().toLocaleLowerCase();
    const normalizedPlaylistQuery = playlistQuery().trim().toLocaleLowerCase();

    return videoRows().filter((row) => {
      const title = row.videoMetadata?.title?.toLocaleLowerCase() ?? "";
      const ownerName = row.ownerMetadata?.name?.toLocaleLowerCase() ?? "";

      if (normalizedTitleQuery !== "" && !title.includes(normalizedTitleQuery)) {
        return false;
      }

      if (
        normalizedWatchIdQuery !== "" &&
        !row.videoId.toLocaleLowerCase().includes(normalizedWatchIdQuery)
      ) {
        return false;
      }

      if (normalizedOwnerQuery !== "" && !ownerName.includes(normalizedOwnerQuery)) {
        return false;
      }

      if (
        normalizedPlaylistQuery !== "" &&
        !row.memberships.some((membership) =>
          membership.playlistTitle.toLocaleLowerCase().includes(normalizedPlaylistQuery),
        )
      ) {
        return false;
      }

      return true;
    });
  });
  const sortedFilteredVideoRows = createMemo(() => {
    const key = sortKey();
    const direction = sortOrder() === "asc" ? 1 : -1;

    return filteredVideoRows()
      .slice()
      .sort((left, right) => compareBySortKey(left, right, key) * direction);
  });

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
    <section class="space-y-6 rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
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
        <div class="mx-auto max-w-[1500px]">
          <div class="space-y-4 border-b border-stone-800 pb-4">
            <div class="flex flex-wrap gap-3">
              <label class="min-w-[12rem] flex-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  タイトル
                </span>
                <ClearableFilterInput
                  value={titleQuery()}
                  onInput={setTitleQuery}
                  onClear={() => setTitleQuery("")}
                  placeholder="タイトルで検索"
                />
              </label>
              <label class="min-w-[10rem] flex-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  watchId
                </span>
                <ClearableFilterInput
                  value={watchIdQuery()}
                  onInput={setWatchIdQuery}
                  onClear={() => setWatchIdQuery("")}
                  placeholder="watchIdで検索"
                />
              </label>
              <label class="min-w-[10rem] flex-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  投稿者
                </span>
                <ClearableFilterInput
                  list="np-video-owner-list"
                  value={ownerQuery()}
                  onInput={setOwnerQuery}
                  onClear={() => setOwnerQuery("")}
                  placeholder="投稿者で検索"
                />
                <datalist id="np-video-owner-list">
                  <For each={ownerOptions()}>{(ownerName) => <option value={ownerName} />}</For>
                </datalist>
              </label>
              <label class="min-w-[12rem] flex-1 space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Playlist
                </span>
                <ClearableFilterInput
                  list="np-video-playlist-list"
                  value={playlistQuery()}
                  onInput={setPlaylistQuery}
                  onClear={() => setPlaylistQuery("")}
                  placeholder="プレイリストで検索"
                />
                <datalist id="np-video-playlist-list">
                  <For each={playlistOptions()}>
                    {(playlistTitle) => <option value={playlistTitle} />}
                  </For>
                </datalist>
              </label>
              <label class="min-w-[9rem] flex-none space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  ソート
                </span>
                <select
                  value={sortKey()}
                  onChange={(event) => setSortKey(event.currentTarget.value as VideoSortKey)}
                  class="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-600"
                >
                  <option value="title">タイトル</option>
                  <option value="registered-at">投稿日時</option>
                  <option value="duration">再生時間</option>
                  <option value="watch-id">watchId</option>
                  <option value="owner">投稿者</option>
                  <option value="playlist-count">playlist件数</option>
                </select>
              </label>
              <div class="min-w-[7rem] flex-none space-y-2">
                <span class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  順序
                </span>
                <button
                  type="button"
                  onClick={() => setSortOrder((current) => (current === "asc" ? "desc" : "asc"))}
                  class="w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-left text-sm text-stone-100 outline-none transition hover:border-stone-700 hover:bg-stone-900 focus:border-stone-600"
                >
                  {sortOrder() === "asc" ? "昇順" : "降順"}
                </button>
              </div>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={toggleAllExpansions}
                disabled={videoRows().length === 0}
                class="rounded-full border border-stone-700 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
              >
                {allExpanded() ? "プレイリストを全て折りたたむ" : "プレイリストを全て展開"}
              </button>
              <p class="text-sm text-stone-400">
                <span class="font-medium text-stone-200">{sortedFilteredVideoRows().length}</span>
                <span class="text-stone-500"> / </span>
                <span class="font-medium text-stone-200">{videoRows().length}</span> 件
              </p>
            </div>
          </div>

          <Show
            when={!props.loading}
            fallback={<p class="py-6 text-sm text-stone-500">読み込み中...</p>}
          >
            <Show
              when={sortedFilteredVideoRows().length > 0}
              fallback={
                <p class="py-6 text-sm text-stone-500">
                  {videoRows().length > 0
                    ? "条件に一致する動画がありません。"
                    : "表示できる動画がありません。"}
                </p>
              }
            >
              <div class="overflow-x-auto pt-4">
                <table class="min-w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-stone-800">
                  <thead class="bg-stone-900/80">
                    <tr class="text-left text-xs uppercase tracking-[0.18em] text-stone-500">
                      <th class="w-12 pl-4 py-3 font-medium">#</th>
                      <th class="w-28 pl-4 py-3 font-medium">サムネ</th>
                      <th class="pl-4 py-3 font-medium">タイトル</th>
                      <th class="w-32 pl-4 py-3 font-medium">投稿日時</th>
                      <th class="w-12 pl-4 py-3 font-medium">時間</th>
                      <th class="w-24 pl-4 py-3 font-medium">watchId</th>
                      <th class="w-36 pl-4 py-3 font-medium">投稿者</th>
                      <th class="w-72 pl-4 pr-4 py-3 font-medium">playlist</th>
                    </tr>
                  </thead>
                  <tbody class="bg-stone-950/40">
                    <For each={sortedFilteredVideoRows()}>
                      {(row, index) => {
                        const thumbnailUrl =
                          row.videoMetadata?.thumbnail.listingUrl ??
                          row.videoMetadata?.thumbnail.url;

                        return (
                          <tr class="align-top text-sm text-stone-200">
                            <td class="border-t border-stone-800 pl-4 py-4 text-xs font-medium text-stone-500">
                              #{index() + 1}
                            </td>
                            <td class="border-t border-stone-800 pl-4 py-4">
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
                            <td class="border-t border-stone-800 pl-4 py-4">
                              <p class="line-clamp-3 font-medium text-stone-100">
                                {row.videoMetadata?.title ?? "未取得"}
                              </p>
                            </td>
                            <td class="border-t border-stone-800 pl-4 py-4 text-xs text-stone-400">
                              {formatRegisteredAt(row.videoMetadata?.registeredAt)}
                            </td>
                            <td class="border-t border-stone-800 pl-4 py-4 text-xs text-stone-400">
                              {formatDuration(row.videoMetadata?.duration)}
                            </td>
                            <td class="border-t border-stone-800 pl-4 py-4 text-xs text-stone-400">
                              {row.videoId}
                            </td>
                            <td class="border-t border-stone-800 pl-4 py-4 text-xs text-stone-400">
                              {row.ownerMetadata?.name ?? "-"}
                            </td>
                            <td class="border-t border-stone-800 pl-4 pr-4 py-4">
                              <div class="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => toggleVideoExpansion(row.videoId)}
                                  class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                >
                                  {isRowExpanded(row.videoId)
                                    ? `プレイリスト ${row.memberships.length}件を折りたたむ`
                                    : `プレイリスト ${row.memberships.length}件を表示`}
                                </button>
                                <Show when={isRowExpanded(row.videoId)}>
                                  <ul class="space-y-2">
                                    <For each={row.memberships}>
                                      {(membership) => (
                                        <li>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              props.onOpenPlaylist(
                                                membership.playlistId as PlaylistId,
                                              )
                                            }
                                            class="w-full rounded-lg border border-stone-800 bg-stone-900/50 px-3 py-2 text-left text-xs text-stone-300 transition hover:border-stone-700 hover:bg-stone-900 hover:text-stone-100"
                                          >
                                            {membership.playlistTitle}
                                          </button>
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
      </div>
    </section>
  );
}
