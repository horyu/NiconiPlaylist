import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";

import { activateStoredPlaylist, deleteStoredPlaylist } from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { buildSharedPlaylistUrl } from "@/lib/playlistUrl";
import { normalizeOptionalText } from "@/lib/text";
import type { PlaylistId } from "@/lib/types";
import { VideoListItem } from "@/options/components/VideoListItem";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

type ShareUrlKind = "id-only" | "with-title" | "with-title-and-memo";

type ShareInfo = {
  playlistId: PlaylistId;
  url: string;
  byteCount: number;
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

export function PlaylistsTab(props: PlaylistsTabProps) {
  const [openShareMenuPlaylistId, setOpenShareMenuPlaylistId] = createSignal<PlaylistId | null>(
    null,
  );
  const [shareInfo, setShareInfo] = createSignal<ShareInfo | null>(null);
  const [shareCopied, setShareCopied] = createSignal(false);
  let shareCopiedTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const videoIds = playlists.flatMap((playlist) => playlist.videoIds);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

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
    setShareInfo({
      playlistId,
      url,
      byteCount: new TextEncoder().encode(url).length,
    });
  }

  async function handleCopySharedUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
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

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">保存済みプレイリスト</h2>
        <p class="text-sm text-stone-400">最後に操作したプレイリストは Active として表示します。</p>
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
          <ul class="space-y-3">
            <For each={props.state?.playlists ?? []}>
              {(playlist) => {
                const playlistShareInfo = () =>
                  shareInfo()?.playlistId === playlist.id ? shareInfo() : null;

                return (
                  <li class="rounded-2xl border border-stone-800 bg-stone-950/50 p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div class="space-y-1">
                        <p class="text-sm font-medium text-stone-100">
                          {playlist.title ?? playlist.id}
                        </p>
                        <p class="text-xs text-stone-400">{playlist.videoIds.length} videos</p>
                      </div>
                      <Show when={playlist.id === props.state?.lastActivePlaylistId}>
                        <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                          Active
                        </span>
                      </Show>
                    </div>

                    <Show when={playlist.memo}>
                      <p class="mt-3 text-sm leading-6 text-stone-400">{playlist.memo}</p>
                    </Show>

                    <ul class="mt-4 space-y-2">
                      <For each={playlist.videoIds}>
                        {(videoId) => {
                          const videoMetadata = () =>
                            props.videoMetadataState?.videoMetadataMap[videoId];
                          const ownerMetadata = () => {
                            const ownerId = videoMetadata()?.ownerId;
                            return ownerId
                              ? props.videoMetadataState?.ownersMap[ownerId]
                              : undefined;
                          };

                          return (
                            <VideoListItem
                              videoId={videoId}
                              videoMetadata={videoMetadata()}
                              ownerMetadata={ownerMetadata()}
                            />
                          );
                        }}
                      </For>
                    </ul>

                    <div class="mt-4 flex gap-2">
                      <button
                        type="button"
                        class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                        onClick={() => void handleActivate(playlist.id)}
                      >
                        選択
                      </button>
                      <div class="relative">
                        <button
                          type="button"
                          class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                          onClick={() =>
                            setOpenShareMenuPlaylistId((currentId) =>
                              currentId === playlist.id ? null : playlist.id,
                            )
                          }
                        >
                          共有
                        </button>
                        <Show when={openShareMenuPlaylistId() === playlist.id}>
                          <div class="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 shadow-lg shadow-black/30">
                            <button
                              type="button"
                              onClick={() =>
                                handleCreateSharedUrl(
                                  playlist.id,
                                  playlist.videoIds,
                                  playlist.title,
                                  playlist.memo,
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
                                  playlist.id,
                                  playlist.videoIds,
                                  playlist.title,
                                  playlist.memo,
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
                                  playlist.id,
                                  playlist.videoIds,
                                  playlist.title,
                                  playlist.memo,
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
                          void handleDelete(playlist.id, playlist.title ?? playlist.id)
                        }
                      >
                        削除
                      </button>
                    </div>

                    <Show when={playlistShareInfo()}>
                      {(info) => (
                        <p class="mt-3 break-all text-sm text-stone-400">
                          <button
                            type="button"
                            class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                            onClick={() => void handleCopySharedUrl(info().url)}
                            disabled={shareCopied()}
                          >
                            {shareCopied() ? "コピー済み" : "コピー"}
                          </button>{" "}
                          {info().byteCount} byte:{" "}
                          <a
                            href={info().url}
                            target="_blank"
                            rel="noreferrer"
                            class="text-stone-200 underline decoration-stone-500 underline-offset-4 transition hover:text-white"
                          >
                            {info().url}
                          </a>
                        </p>
                      )}
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Match>
      </Switch>
    </section>
  );
}
