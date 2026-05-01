import { createEffect, For, Match, Show, Switch } from "solid-js";

import { activateStoredPlaylist, deleteStoredPlaylist } from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import type { PlaylistId } from "@/lib/types";
import { VideoListItem } from "@/options/components/VideoListItem";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";

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
  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const videoIds = playlists.flatMap((playlist) => playlist.videoIds);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
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

  async function handleDelete(playlistId: PlaylistId) {
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

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 space-y-1">
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
              {(playlist) => (
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
                          return ownerId ? props.videoMetadataState?.ownersMap[ownerId] : undefined;
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

                  <div class="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                      onClick={() => void handleActivate(playlist.id)}
                    >
                      選択
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10"
                      onClick={() => void handleDelete(playlist.id)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
    </section>
  );
}
