import { createResource, createSignal, For, Match, Show, Switch } from "solid-js";

import { importSharedPlaylist } from "@/background/services/importPlaylist";
import { getLastActivePlaylistId, getStoredPlaylists } from "@/background/services/playlistStore";
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

function Options() {
  const [sharedUrl, setSharedUrl] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [state, { refetch }] = createResource(fetchPlaylistsState);

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

            <div class="flex items-center justify-between gap-4">
              <Show when={feedback()}>
                {(message) => <p class="text-sm text-stone-400">{message()}</p>}
              </Show>
              <button
                type="submit"
                class="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-950 transition hover:bg-white"
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
