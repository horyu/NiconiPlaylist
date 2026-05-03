import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Switch,
  Match,
} from "solid-js";
import { browser } from "wxt/browser";

import {
  activateStoredPlaylist,
  getLastActivePlaylistId,
  getStoredPlaybackContextByTabId,
  getStoredPlaylists,
  setStoredPlaybackContextIndex,
} from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import {
  getStoredOwnersMap,
  getStoredVideoMetadataMap,
} from "@/background/services/videoMetadataStore";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { PlaybackContext, Playlist, PlaylistId } from "@/lib/types";
import type { OwnerMetadata, VideoMetadata } from "@/lib/videoMetadataTypes";

type PopupState = {
  activeTabId: number | null;
  ownersMap: Record<string, OwnerMetadata>;
  playbackContext: PlaybackContext | null;
  playlists: Playlist[];
  lastActivePlaylistId: PlaylistId | null;
  videoMetadataMap: Record<string, VideoMetadata>;
};

type StorageChanges = Record<
  string,
  {
    oldValue?: unknown;
    newValue?: unknown;
  }
>;

function formatDuration(duration: number | null | undefined): string {
  if (duration === null || duration === undefined) {
    return "--:--";
  }

  const minutes = Math.floor(duration / 60);
  const seconds = (duration % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

async function getActiveTabId(): Promise<number | null> {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return typeof activeTab?.id === "number" ? activeTab.id : null;
}

async function fetchPopupState(): Promise<PopupState> {
  const activeTabId = await getActiveTabId();
  const [playlists, lastActivePlaylistId, videoMetadataMap, ownersMap, playbackContext] =
    await Promise.all([
      getStoredPlaylists(),
      getLastActivePlaylistId(),
      getStoredVideoMetadataMap(),
      getStoredOwnersMap(),
      activeTabId === null ? Promise.resolve(null) : getStoredPlaybackContextByTabId(activeTabId),
    ]);

  return {
    activeTabId,
    ownersMap,
    playbackContext,
    playlists,
    lastActivePlaylistId,
    videoMetadataMap,
  };
}

function formatPlaylistOptionLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function formatIndex(index: number): string {
  return (index + 1).toString();
}

function buildWatchUrl(videoId: string): string {
  return `https://www.nicovideo.jp/watch/${videoId}`;
}

function Popup() {
  const [popupState, { refetch }] = createResource(fetchPopupState);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const activePlaylist = () =>
    popupState()?.playlists.find(
      (playlist) => playlist.id === popupState()?.lastActivePlaylistId,
    ) ?? null;

  const currentPlaybackIndex = () => {
    const state = popupState();
    const playlist = activePlaylist();

    if (!state?.playbackContext || !playlist) {
      return null;
    }

    return state.playbackContext.playlistId === playlist.id
      ? state.playbackContext.currentIndex
      : null;
  };

  createEffect(() => {
    const videoIds = activePlaylist()?.videoIds ?? [];

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  onMount(() => {
    const handleStorageChanged = (changes: StorageChanges) => {
      if (
        changes[STORAGE_KEYS.playlists] ||
        changes[STORAGE_KEYS.lastActivePlaylistId] ||
        changes[STORAGE_KEYS.playbackContexts]
      ) {
        void refetch();
      }

      if (changes[STORAGE_KEYS.videoMetadata] || changes[STORAGE_KEYS.owners]) {
        void refetch();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChanged);
    void refetch();

    onCleanup(() => {
      browser.storage.onChanged.removeListener(handleStorageChanged);
    });
  });

  async function handleActivate(playlistId: PlaylistId) {
    setFeedback(null);

    try {
      await activateStoredPlaylist(playlistId);
      await refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "プレイリストの選択に失敗しました。");
    }
  }

  async function handleMovePlaybackIndex(index: number) {
    const state = popupState();
    const playlist = activePlaylist();
    const nextVideoId = playlist?.videoIds[index];

    if (!state?.activeTabId || !playlist || !nextVideoId) {
      setFeedback("現在のタブ情報を取得できません。");
      return;
    }

    setFeedback(null);

    try {
      await setStoredPlaybackContextIndex(state.activeTabId, playlist.id, index);
      await browser.tabs.update(state.activeTabId, {
        url: buildWatchUrl(nextVideoId),
      });
      await refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "再生位置の更新に失敗しました。");
    }
  }

  return (
    <main class="min-h-screen min-w-[30rem] bg-stone-950 px-3 py-3 text-stone-100">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-lg font-semibold text-stone-50">NiconiPlaylist</h1>
          <button
            type="button"
            onClick={() => {
              void browser.runtime.openOptionsPage();
            }}
            class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 text-xs text-stone-200 transition hover:bg-stone-800"
            title="オプションを開く"
            aria-label="オプションを開く"
          >
            ⚙
          </button>
        </div>

        <Show when={feedback()}>
          {(message) => (
            <div class="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {message()}
            </div>
          )}
        </Show>

        <Switch
          fallback={
            <div class="space-y-2 rounded-xl bg-stone-900/40 px-3 py-3">
              <p class="text-sm font-medium text-stone-200">保存済みプレイリストはありません。</p>
              <p class="text-sm leading-5 text-stone-400">
                オプションページから共有 URL をインポートするか、新規作成してください。
              </p>
            </div>
          }
        >
          <Match when={popupState.loading}>
            <p class="text-sm text-stone-400">プレイリストを読み込み中...</p>
          </Match>

          <Match when={popupState.error}>
            <p class="text-sm text-red-300">プレイリストの読み込みに失敗しました。</p>
          </Match>

          <Match when={popupState()?.playlists.length}>
            <div class="space-y-3">
              <div>
                <select
                  class="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                  value={popupState()?.lastActivePlaylistId ?? ""}
                  onChange={(event) => void handleActivate(event.currentTarget.value)}
                >
                  <For each={popupState()?.playlists}>
                    {(playlist) => (
                      <option value={playlist.id}>{formatPlaylistOptionLabel(playlist)}</option>
                    )}
                  </For>
                </select>
              </div>

              <Show when={activePlaylist()}>
                {(playlist) => (
                  <div class="space-y-3">
                    <div class="flex items-center justify-between gap-3 rounded-xl bg-stone-900/40 px-3 py-2.5">
                      <p class="text-xs text-stone-400">{playlist().videoIds.length} 件</p>
                      <Show when={currentPlaybackIndex() !== null}>
                        <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                          再生中: {formatIndex(currentPlaybackIndex() ?? 0)}
                        </span>
                      </Show>
                    </div>
                    <Show when={playlist().memo}>
                      {(memo) => <p class="text-xs leading-5 text-stone-500">{memo()}</p>}
                    </Show>

                    <ul class="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                      <For each={playlist().videoIds}>
                        {(videoId, index) => {
                          const videoMetadata = () => popupState()?.videoMetadataMap[videoId];
                          const ownerMetadata = () => {
                            const ownerId = videoMetadata()?.ownerId;
                            return ownerId ? popupState()?.ownersMap[ownerId] : undefined;
                          };
                          const isCurrent = () => currentPlaybackIndex() === index();

                          return (
                            <li
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
                                  when={
                                    videoMetadata()?.thumbnail.listingUrl ??
                                    videoMetadata()?.thumbnail.url
                                  }
                                >
                                  {(thumbnailUrl) => (
                                    <img
                                      src={thumbnailUrl()}
                                      alt=""
                                      class="h-full w-full object-cover"
                                    />
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
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-default disabled:border-emerald-500/40 disabled:bg-emerald-500/10 disabled:text-emerald-200"
                                  disabled={isCurrent()}
                                  onClick={() => void handleMovePlaybackIndex(index())}
                                >
                                  {isCurrent() ? "現在位置" : "ここから再生"}
                                </button>
                              </div>
                            </li>
                          );
                        }}
                      </For>
                    </ul>
                  </div>
                )}
              </Show>
            </div>
          </Match>
        </Switch>
      </div>
    </main>
  );
}

export default Popup;
