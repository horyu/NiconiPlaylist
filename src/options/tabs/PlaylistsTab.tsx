import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";

import { activateStoredPlaylist, deleteStoredPlaylist } from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { buildSharedPlaylistUrl } from "@/lib/playlistUrl";
import { normalizeOptionalText } from "@/lib/text";
import type { Playlist, PlaylistId } from "@/lib/types";
import { PlaylistDetailVideoList } from "@/options/components/PlaylistDetailVideoList";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type ShareUrlKind = "id-only" | "with-title" | "with-title-and-memo";

type ShareInfo = {
  playlistId: PlaylistId;
  byteCount: number;
  previewText: string;
};

type PlaylistsTabProps = {
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
  loading: boolean;
  error: unknown;
  onActivated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onFeedback: (message: string | null) => void;
};

function getPlaylistLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function formatSharedUrlPreview(url: string): string {
  if (url.length <= 96) {
    return url;
  }

  return `${url.slice(0, 64)} ... ${url.slice(-24)}`;
}

export function PlaylistsTab(props: PlaylistsTabProps) {
  const [playlistQuery, setPlaylistQuery] = createSignal("");
  const [selectedPlaylistId, setSelectedPlaylistId] = createSignal<PlaylistId | null>(null);
  const [openShareMenuPlaylistId, setOpenShareMenuPlaylistId] = createSignal<PlaylistId | null>(
    null,
  );
  const [shareInfo, setShareInfo] = createSignal<ShareInfo | null>(null);
  const [shareCopied, setShareCopied] = createSignal(false);
  let shareCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  let currentSharedUrl = "";
  let currentSharedUrlPlaylistId: PlaylistId | null = null;

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const videoIds = playlists.flatMap((playlist) => playlist.videoIds);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const currentSelectedPlaylistId = selectedPlaylistId();

    if (playlists.length === 0) {
      if (currentSelectedPlaylistId !== null) {
        setSelectedPlaylistId(null);
      }
      return;
    }

    if (
      currentSelectedPlaylistId &&
      playlists.some((playlist) => playlist.id === currentSelectedPlaylistId)
    ) {
      return;
    }

    setSelectedPlaylistId(props.state?.lastActivePlaylistId ?? playlists[0]!.id);
  });

  const filteredPlaylists = createMemo(() => {
    const playlists = props.state?.playlists ?? [];
    const query = playlistQuery().trim().toLowerCase();

    if (!query) {
      return playlists;
    }

    return playlists.filter((playlist) => {
      const label = getPlaylistLabel(playlist).toLowerCase();
      const memo = playlist.memo?.toLowerCase() ?? "";

      return (
        label.includes(query) || memo.includes(query) || playlist.id.toLowerCase().includes(query)
      );
    });
  });

  const selectedPlaylist = createMemo(
    () => props.state?.playlists.find((playlist) => playlist.id === selectedPlaylistId()) ?? null,
  );

  onCleanup(() => {
    if (shareCopiedTimer) {
      clearTimeout(shareCopiedTimer);
    }
  });

  async function handleActivate(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      await activateStoredPlaylist(playlistId);
      props.onFeedback("アクティブなプレイリストを更新しました。");
      await props.onActivated();
    } catch (error) {
      props.onFeedback(
        error instanceof Error ? error.message : "プレイリストの選択に失敗しました。",
      );
    }
  }

  async function handleDelete(playlistId: PlaylistId, title: string) {
    if (!window.confirm(`「${title}」を削除しますか？`)) {
      return;
    }
    props.onFeedback(null);

    try {
      await deleteStoredPlaylist(playlistId);
      props.onFeedback("プレイリストを削除しました。");
      setOpenShareMenuPlaylistId((currentId) => (currentId === playlistId ? null : currentId));
      setShareInfo((currentInfo) => (currentInfo?.playlistId === playlistId ? null : currentInfo));
      if (currentSharedUrlPlaylistId === playlistId) {
        currentSharedUrl = "";
        currentSharedUrlPlaylistId = null;
      }
      await props.onDeleted();
    } catch (error) {
      props.onFeedback(
        error instanceof Error ? error.message : "プレイリストの削除に失敗しました。",
      );
    }
  }

  function handleCreateSharedUrl(
    playlistId: PlaylistId,
    videoIds: string[],
    title: string | undefined,
    memo: string | undefined,
    kind: ShareUrlKind,
  ) {
    const url = buildSharedPlaylistUrl({
      videoIds,
      title: kind === "id-only" ? undefined : normalizeOptionalText(title),
      memo: kind === "with-title-and-memo" ? normalizeOptionalText(memo) : undefined,
    });

    setOpenShareMenuPlaylistId(null);
    setShareCopied(false);
    currentSharedUrl = url;
    currentSharedUrlPlaylistId = playlistId;
    setShareInfo({
      playlistId,
      byteCount: url.length,
      previewText: formatSharedUrlPreview(url),
    });
  }

  async function handleCopySharedUrl() {
    try {
      await navigator.clipboard.writeText(currentSharedUrl);
      props.onFeedback(null);
      setShareCopied(true);

      if (shareCopiedTimer) {
        clearTimeout(shareCopiedTimer);
      }

      shareCopiedTimer = setTimeout(() => {
        setShareCopied(false);
        shareCopiedTimer = null;
      }, 1500);
    } catch (error) {
      setShareCopied(false);
      props.onFeedback(
        error instanceof Error ? error.message : "共有 URL のコピーに失敗しました。",
      );
    }
  }

  function handleOpenSharedUrl() {
    window.open(currentSharedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">保存済みプレイリスト</h2>
        <p class="text-sm text-stone-400">一覧から選択したプレイリストだけを詳しく表示します。</p>
      </div>

      <Switch
        fallback={
          <p class="text-sm leading-6 text-stone-400">
            保存済みプレイリストはまだありません。共有 URL をインポートしてください。
          </p>
        }
      >
        <Match when={props.loading}>
          <p class="text-sm text-stone-400">読み込み中...</p>
        </Match>

        <Match when={props.error}>
          <p class="text-sm text-red-300">保存済みプレイリストを取得できませんでした。</p>
        </Match>

        <Match when={props.state?.playlists.length}>
          <div class="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <section class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
              <div class="space-y-2">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                  Playlist List
                </p>
                <label class="block">
                  <input
                    type="text"
                    class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                    placeholder="プレイリストを検索"
                    value={playlistQuery()}
                    onInput={(event) => setPlaylistQuery(event.currentTarget.value)}
                  />
                </label>
              </div>

              <div class="max-h-[44rem] space-y-2 overflow-y-auto pr-1">
                <For each={filteredPlaylists()}>
                  {(playlist) => {
                    const isSelected = () => playlist.id === selectedPlaylistId();
                    const isActive = () => playlist.id === props.state?.lastActivePlaylistId;

                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedPlaylistId(playlist.id)}
                        class={`block w-full rounded-2xl border px-4 py-3 text-left transition ${
                          isSelected()
                            ? "border-stone-400 bg-stone-900 text-stone-50"
                            : "border-stone-800 bg-stone-950/50 text-stone-200 hover:border-stone-700 hover:bg-stone-900/70"
                        }`}
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0 space-y-1">
                            <p class="truncate text-sm font-medium">{getPlaylistLabel(playlist)}</p>
                            <p class="text-xs text-stone-400">{playlist.videoIds.length} videos</p>
                          </div>
                          <Show when={isActive()}>
                            <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                              Active
                            </span>
                          </Show>
                        </div>

                        <Show when={playlist.memo}>
                          <p class="mt-2 overflow-hidden text-xs leading-5 text-stone-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {playlist.memo}
                          </p>
                        </Show>
                      </button>
                    );
                  }}
                </For>

                <Show when={!filteredPlaylists().length}>
                  <p class="rounded-2xl border border-dashed border-stone-800 px-4 py-6 text-sm text-stone-500">
                    条件に一致するプレイリストはありません。
                  </p>
                </Show>
              </div>
            </section>

            <section class="space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
              <Show
                when={selectedPlaylist()}
                keyed
                fallback={
                  <div class="rounded-2xl border border-dashed border-stone-800 px-4 py-8 text-sm text-stone-500">
                    左の一覧からプレイリストを選択してください。
                  </div>
                }
              >
                {(detailPlaylist) => {
                  const playlistShareInfo = () =>
                    shareInfo()?.playlistId === detailPlaylist.id ? shareInfo() : null;
                  const hasCurrentSharedUrl = () =>
                    currentSharedUrlPlaylistId === detailPlaylist.id;

                  return (
                    <div class="space-y-4">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 space-y-1">
                          <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Playlist Detail
                          </p>
                          <h3 class="break-words text-xl font-semibold text-stone-50">
                            {getPlaylistLabel(detailPlaylist)}
                          </h3>
                          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                            <span>{detailPlaylist.videoIds.length} videos</span>
                            <span class="text-stone-600">•</span>
                            <span>{detailPlaylist.id}</span>
                            <Show when={detailPlaylist.id === props.state?.lastActivePlaylistId}>
                              <>
                                <span class="text-stone-600">•</span>
                                <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                                  Active
                                </span>
                              </>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                          onClick={() => void handleActivate(detailPlaylist.id)}
                        >
                          選択
                        </button>
                        <div class="relative">
                          <button
                            type="button"
                            class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                            onClick={() =>
                              setOpenShareMenuPlaylistId((currentId) =>
                                currentId === detailPlaylist.id ? null : detailPlaylist.id,
                              )
                            }
                          >
                            共有
                          </button>
                          <Show when={openShareMenuPlaylistId() === detailPlaylist.id}>
                            <div class="absolute left-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 shadow-lg shadow-black/30">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreateSharedUrl(
                                    detailPlaylist.id,
                                    detailPlaylist.videoIds,
                                    detailPlaylist.title,
                                    detailPlaylist.memo,
                                    "id-only",
                                  )
                                }
                                class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                              >
                                IDのみ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreateSharedUrl(
                                    detailPlaylist.id,
                                    detailPlaylist.videoIds,
                                    detailPlaylist.title,
                                    detailPlaylist.memo,
                                    "with-title",
                                  )
                                }
                                class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                              >
                                タイトル付き
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCreateSharedUrl(
                                    detailPlaylist.id,
                                    detailPlaylist.videoIds,
                                    detailPlaylist.title,
                                    detailPlaylist.memo,
                                    "with-title-and-memo",
                                  )
                                }
                                class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                              >
                                タイトル・メモ付き
                              </button>
                            </div>
                          </Show>
                        </div>
                        <button
                          type="button"
                          class="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10"
                          onClick={() =>
                            void handleDelete(detailPlaylist.id, getPlaylistLabel(detailPlaylist))
                          }
                        >
                          削除
                        </button>
                      </div>

                      <Show when={detailPlaylist.memo}>
                        <div class="rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3">
                          <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Memo
                          </p>
                          <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                            {detailPlaylist.memo}
                          </p>
                        </div>
                      </Show>

                      <Show when={playlistShareInfo()}>
                        {(info) => (
                          <div class="flex flex-wrap items-center gap-2 text-sm text-stone-400">
                            <button
                              type="button"
                              class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                              onClick={() => void handleCopySharedUrl()}
                              disabled={shareCopied() || !hasCurrentSharedUrl()}
                            >
                              {shareCopied() ? "コピー済み" : "コピー"}
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50"
                              onClick={() => handleOpenSharedUrl()}
                              disabled={!hasCurrentSharedUrl()}
                            >
                              URLを開く
                            </button>
                            <span>{info().byteCount} byte:</span>
                            <span class="max-w-full truncate text-stone-200">
                              {info().previewText}
                            </span>
                          </div>
                        )}
                      </Show>

                      <PlaylistDetailVideoList
                        videoIds={detailPlaylist.videoIds}
                        videoMetadataState={props.videoMetadataState}
                      />
                    </div>
                  );
                }}
              </Show>
            </section>
          </div>
        </Match>
      </Switch>
    </section>
  );
}
