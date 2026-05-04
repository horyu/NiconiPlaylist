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
  getStoredPlaybackContexts,
  setStoredPlaybackContextIndex,
} from "@/background/services/playlistStore";
import { getPopupState } from "@/background/services/popupState";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { Playlist, PlaylistId } from "@/lib/types";
import { PopupPlaylistVideoList } from "@/popup/components/PopupPlaylistVideoList";
import {
  createActivePlaylist,
  createActivePlaylistAliveTabId,
  createCurrentPlaybackIndex,
} from "@/popup/hooks/usePopupPlaybackState";

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

async function resolveAliveTabIds(tabIds: number[]): Promise<Set<number>> {
  const settledTabs = await Promise.allSettled(
    tabIds.map((tabId) =>
      browser.tabs.get(tabId).then((tab) => {
        if (typeof tab.id !== "number") {
          return null;
        }

        if (!tab.url || !tab.url.startsWith(WATCH_URL_PREFIX)) {
          return null;
        }

        return tab.id;
      }),
    ),
  );

  return new Set(
    settledTabs.flatMap((result) =>
      result.status === "fulfilled" && typeof result.value === "number" ? [result.value] : [],
    ),
  );
}

function formatPlaylistOptionLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function buildWatchUrl(videoId: string): string {
  return `https://www.nicovideo.jp/watch/${videoId}`;
}

const WATCH_URL_PREFIX = "https://www.nicovideo.jp/watch/";

function isNewTabUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }

  return !/^https?:\/\//u.test(url);
}

function Popup() {
  const [popupState, { refetch }] = createResource(getPopupState);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [manualScrollRequestKey, setManualScrollRequestKey] = createSignal(0);
  const [aliveTabIdByPlaylistId, setAliveTabIdByPlaylistId] = createSignal<
    Partial<Record<PlaylistId, number>>
  >({});
  const activePlaylist = createActivePlaylist(() => popupState());
  const activePlaylistAliveTabId = createActivePlaylistAliveTabId(
    activePlaylist,
    aliveTabIdByPlaylistId,
  );
  const playbackTabId = () => {
    const state = popupState();
    const playlist = activePlaylist();

    if (!state || !playlist) {
      return null;
    }

    const aliveTabId = activePlaylistAliveTabId();

    if (aliveTabId !== null) {
      return aliveTabId;
    }

    const activeTabId = state.activeTabId;
    const activeTabUrl = state.activeTabUrl ?? null;

    if (!activeTabId || !activeTabUrl?.startsWith(WATCH_URL_PREFIX)) {
      return null;
    }

    const activeTabPlaybackContext = state.playbackContexts.find(
      (context) => context.tabId === activeTabId,
    );

    if (activeTabPlaybackContext?.playlistId !== playlist.id) {
      return null;
    }

    return activeTabId;
  };
  const currentPlaybackIndex = createCurrentPlaybackIndex(
    () => popupState(),
    activePlaylist,
    playbackTabId,
  );
  const activePlaylistVideoCount = () => activePlaylist()?.videoIds.length ?? 0;
  const autoScrollKey = () => {
    const playlist = activePlaylist();
    const playbackIndex = currentPlaybackIndex();
    const activeTabUrl = popupState()?.activeTabUrl ?? null;

    if (!playlist || playbackIndex === null) {
      return null;
    }

    return `${playlist.id}:${playbackIndex}:${activeTabUrl ?? ""}`;
  };

  createEffect(() => {
    const videoIds = activePlaylist()?.videoIds ?? [];

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  async function refreshAliveTabMap() {
    const playbackContexts = await getStoredPlaybackContexts();
    const aliveTabIds = await resolveAliveTabIds([
      ...new Set(playbackContexts.map((context) => context.tabId)),
    ]);
    const nextAliveTabIdByPlaylistId = playbackContexts.reduce<Partial<Record<PlaylistId, number>>>(
      (result, context) => {
        if (!aliveTabIds.has(context.tabId) || result[context.playlistId] !== undefined) {
          return result;
        }

        result[context.playlistId] = context.tabId;
        return result;
      },
      {},
    );

    setAliveTabIdByPlaylistId(nextAliveTabIdByPlaylistId);
  }

  onMount(() => {
    const handleStorageChanged = (changes: StorageChanges) => {
      if (
        changes[STORAGE_KEYS.playlists] ||
        changes[STORAGE_KEYS.lastActivePlaylistId] ||
        changes[STORAGE_KEYS.playbackContexts]
      ) {
        void refetch();
        void refreshAliveTabMap();
      }

      if (changes[STORAGE_KEYS.videoMetadata] || changes[STORAGE_KEYS.owners]) {
        void refetch();
      }
    };
    const handleTabUpdated = (tabId: number, changeInfo: { url?: string }) => {
      if (tabId !== popupState()?.activeTabId || changeInfo.url === undefined) {
        return;
      }

      void refetch();
    };

    browser.storage.onChanged.addListener(handleStorageChanged);
    browser.tabs.onUpdated.addListener(handleTabUpdated);
    void refetch();
    void refreshAliveTabMap();

    onCleanup(() => {
      browser.storage.onChanged.removeListener(handleStorageChanged);
      browser.tabs.onUpdated.removeListener(handleTabUpdated);
    });
  });

  async function handleActivate(playlistId: PlaylistId) {
    setFeedback(null);

    try {
      await activateStoredPlaylist(playlistId);
      await refetch();
      await refreshAliveTabMap();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "プレイリストの選択に失敗しました。");
    }
  }

  async function handleFocusPlaybackTab() {
    const tabId = playbackTabId();

    if (tabId === null) {
      return;
    }

    setFeedback(null);

    try {
      const tab = await browser.tabs.get(tabId);
      const tasks: Promise<unknown>[] = [
        browser.tabs.update(tabId, {
          active: true,
        }),
      ];

      if (typeof tab.windowId === "number") {
        tasks.push(
          browser.windows.update(tab.windowId, {
            focused: true,
          }),
        );
      }

      await Promise.all(tasks);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "対応タブへ移動できませんでした。");
    }
  }

  async function handleMovePlaybackIndex(index: number) {
    const state = popupState();
    const playlist = activePlaylist();
    const nextVideoId = playlist?.videoIds[index];
    const activeTabId = state?.activeTabId ?? null;
    const activeTabUrl = state?.activeTabUrl ?? null;
    const playbackTabIdValue = playbackTabId();

    if (!playlist || !nextVideoId) {
      setFeedback("現在のタブ情報を取得できません。");
      return;
    }

    setFeedback(null);

    try {
      const watchUrl = buildWatchUrl(nextVideoId);

      if (playbackTabIdValue !== null) {
        await setStoredPlaybackContextIndex(playbackTabIdValue, playlist.id, index);
        await browser.tabs.update(playbackTabIdValue, {
          url: watchUrl,
        });
        await refetch();
        return;
      }

      if (activeTabId && isNewTabUrl(activeTabUrl)) {
        await setStoredPlaybackContextIndex(activeTabId, playlist.id, index);
        await browser.tabs.update(activeTabId, {
          url: watchUrl,
        });
        await refetch();
        return;
      }

      const createdTab = await browser.tabs.create({
        url: watchUrl,
        active: true,
      });

      if (typeof createdTab.id !== "number") {
        throw new Error("新しいタブを作成できませんでした。");
      }

      await setStoredPlaybackContextIndex(createdTab.id, playlist.id, index);
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
          <Match when={popupState.loading && !popupState()}>
            <p class="text-sm text-stone-400">プレイリストを読み込み中...</p>
          </Match>

          <Match when={popupState.error && !popupState()}>
            <p class="text-sm text-red-300">プレイリストの読み込みに失敗しました。</p>
          </Match>

          <Match when={popupState()?.playlists.length}>
            <div class="space-y-3">
              <div class="flex items-center gap-2">
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
                <button
                  type="button"
                  class={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                    currentPlaybackIndex() !== null
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                      : "border-stone-700 bg-stone-900 text-stone-300"
                  }`}
                  title="再生中の動画へ移動"
                  aria-label="再生中の動画へ移動"
                  onClick={() => {
                    if (currentPlaybackIndex() === null) {
                      return;
                    }
                    setManualScrollRequestKey((value) => value + 1);
                  }}
                >
                  {currentPlaybackIndex() === null ? "-" : (currentPlaybackIndex() ?? 0) + 1}
                  {" / "}
                  {activePlaylistVideoCount()}件
                </button>
              </div>

              <Show when={activePlaylist()}>
                {(playlist) => (
                  <div class="space-y-3">
                    <Show when={playlist().memo}>
                      {(memo) => <p class="text-xs leading-5 text-stone-500">{memo()}</p>}
                    </Show>
                    <PopupPlaylistVideoList
                      autoScrollKey={autoScrollKey()}
                      currentPlaybackIndex={currentPlaybackIndex()}
                      hasPlaybackTab={playbackTabId() !== null}
                      manualScrollRequestKey={manualScrollRequestKey()}
                      onFocusPlaybackTab={() => void handleFocusPlaybackTab()}
                      onMovePlaybackIndex={(index) => void handleMovePlaybackIndex(index)}
                      ownersMap={popupState()?.ownersMap ?? {}}
                      playlist={playlist()}
                      videoMetadataMap={popupState()?.videoMetadataMap ?? {}}
                    />
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
