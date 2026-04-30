import { createMemo, createResource, createSignal, For, Match, Show, Switch } from "solid-js";

import { importSharedPlaylist } from "@/background/services/importPlaylist";
import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
import { parseSharedPlaylistUrl } from "@/lib/playlistUrl";
import type { Playlist } from "@/lib/types";

type PlaylistsState = {
  playlists: Playlist[];
  lastActivePlaylistId: string | null;
};

async function fetchPlaylistsState(): Promise<PlaylistsState> {
  const [playlists, lastActivePlaylistId] = await Promise.all([
    getStoredPlaylists(),
    getLastActivePlaylistId(),
  ]);

  return {
    playlists,
    lastActivePlaylistId,
  };
}

type PreviewState =
  | {
      kind: "empty";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "ready";
      title?: string;
      memo?: string;
      videoIds: string[];
    };

type ErrorPreviewState = Extract<PreviewState, { kind: "error" }>;
type ReadyPreviewState = Extract<PreviewState, { kind: "ready" }>;

function Options() {
  const [sharedUrl, setSharedUrl] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [state, { refetch }] = createResource(fetchPlaylistsState);
  const preview = createMemo<PreviewState>(() => {
    const value = sharedUrl().trim();

    if (!value) {
      return { kind: "empty" };
    }

    try {
      return { kind: "ready", ...parseSharedPlaylistUrl(value) };
    } catch (error) {
      return {
        kind: "error",
        message: error instanceof Error ? error.message : "共有 URL を解析できませんでした。",
      };
    }
  });
  const readyPreview = createMemo<ReadyPreviewState | null>(() => {
    const current = preview();
    return current.kind === "ready" ? current : null;
  });
  const errorPreview = createMemo<ErrorPreviewState | null>(() => {
    const current = preview();
    return current.kind === "error" ? current : null;
  });

  async function handleImport(event: SubmitEvent) {
    event.preventDefault();
    setFeedback(null);

    try {
      await importSharedPlaylist(sharedUrl().trim());

      setSharedUrl("");
      setFeedback("プレイリストをインポートしました。");
      await refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "インポートに失敗しました。");
    }
  }

  return (
    <main class="min-h-screen bg-stone-950 px-4 py-6 text-stone-100">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header class="space-y-2">
          <p class="text-xs font-medium uppercase tracking-[0.24em] text-stone-500">
            NiconiPlaylist
          </p>
          <h1 class="text-2xl font-semibold text-stone-50">Options</h1>
          <p class="max-w-2xl text-sm leading-6 text-stone-400">
            共有 URL を貼り付けてプレイリストを保存します。保存済みプレイリストは popup
            からも参照できます。
          </p>
        </header>

        <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
          <form class="space-y-4" onSubmit={handleImport}>
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">共有 URL</span>
              <textarea
                class="min-h-32 w-full rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                placeholder="https://horyu.github.io/NiconiPlaylist/import?title=..."
                value={sharedUrl()}
                onInput={(event) => setSharedUrl(event.currentTarget.value)}
              />
            </label>

            <section class="rounded-2xl border border-stone-800 bg-stone-950/60 p-4">
              <div class="mb-3 space-y-1">
                <h2 class="text-sm font-medium text-stone-100">インポート前プレビュー</h2>
                <p class="text-xs leading-5 text-stone-500">
                  title、memo、件数、先頭数件の videoId を保存前に確認します。
                </p>
              </div>

              <Switch
                fallback={
                  <div class="space-y-3">
                    <div class="space-y-1">
                      <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Title</p>
                      <p class="text-sm text-stone-300">{readyPreview()?.title ?? "未指定"}</p>
                    </div>

                    <div class="space-y-1">
                      <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Memo</p>
                      <p class="text-sm leading-6 text-stone-300">
                        {readyPreview()?.memo ?? "未指定"}
                      </p>
                    </div>

                    <div class="space-y-1">
                      <p class="text-xs uppercase tracking-[0.2em] text-stone-500">Videos</p>
                      <p class="text-sm text-stone-300">
                        {readyPreview()?.videoIds.length ?? 0} 件
                      </p>
                    </div>

                    <div class="space-y-2">
                      <p class="text-xs uppercase tracking-[0.2em] text-stone-500">
                        First videoIds
                      </p>
                      <ul class="space-y-2">
                        <For each={readyPreview()?.videoIds.slice(0, 5) ?? []}>
                          {(videoId) => (
                            <li class="rounded-xl border border-stone-800 bg-stone-900/60 px-3 py-2 text-sm text-stone-300">
                              {videoId}
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </div>
                }
              >
                <Match when={preview().kind === "empty"}>
                  <p class="text-sm leading-6 text-stone-400">
                    共有 URL を入力すると、インポート前に内容を表示します。
                  </p>
                </Match>

                <Match when={preview().kind === "error"}>
                  <p class="text-sm leading-6 text-red-300">{errorPreview()?.message ?? ""}</p>
                </Match>
              </Switch>
            </section>

            <div class="flex items-center justify-between gap-4">
              <Show when={feedback()}>
                {(message) => <p class="text-sm text-stone-400">{message()}</p>}
              </Show>
              <button
                type="submit"
                disabled={preview().kind !== "ready"}
                class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
              >
                インポート
              </button>
            </div>
          </form>
        </section>

        <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
          <div class="mb-4 space-y-1">
            <h2 class="text-lg font-semibold text-stone-50">保存済みプレイリスト</h2>
            <p class="text-sm text-stone-400">
              最後に操作したプレイリストは Active として表示します。
            </p>
          </div>

          <Switch
            fallback={
              <p class="text-sm leading-6 text-stone-400">
                保存済みプレイリストはまだありません。共有 URL をインポートしてください。
              </p>
            }
          >
            <Match when={state.loading}>
              <p class="text-sm text-stone-400">読み込み中...</p>
            </Match>

            <Match when={state.error}>
              <p class="text-sm text-red-300">保存済みプレイリストを取得できませんでした。</p>
            </Match>

            <Match when={state()?.playlists.length}>
              <ul class="space-y-3">
                <For each={state()?.playlists}>
                  {(playlist) => (
                    <li class="rounded-2xl border border-stone-800 bg-stone-950/50 p-4">
                      <div class="flex items-start justify-between gap-3">
                        <div class="space-y-1">
                          <p class="text-sm font-medium text-stone-100">
                            {playlist.title ?? playlist.id}
                          </p>
                          <p class="text-xs text-stone-400">{playlist.videoIds.length} videos</p>
                        </div>
                        <Show when={playlist.id === state()?.lastActivePlaylistId}>
                          <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                            Active
                          </span>
                        </Show>
                      </div>

                      <Show when={playlist.memo}>
                        <p class="mt-3 text-sm leading-6 text-stone-400">{playlist.memo}</p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Match>
          </Switch>
        </section>
      </div>
    </main>
  );
}

export default Options;
