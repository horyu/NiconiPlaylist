import {
  createEffect,
  createMemo,
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

import { updateStoredPlaybackSettings } from "@/background/services/playbackSettings";
import {
  activateStoredPlaylist,
  getStoredPlaybackContexts,
  updateStoredPlaylist,
} from "@/background/services/playlistStore";
import { getPopupState } from "@/background/services/popupState";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { isWatchUrl } from "@/lib/nicovideoUrl";
import { formatRepeatPresetLabel, sanitizePlaybackSettings } from "@/lib/playlistLoop";
import type { PopupMessage, PopupPlaybackTransitionMode } from "@/lib/popupMessages";
import { STORAGE_KEYS } from "@/lib/storageSchema";
import type { PlaybackSettings, Playlist, PlaylistId } from "@/lib/types";
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

        if (!isWatchUrl(tab.url)) {
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

function formatPlaylistOptionLabel(playlist: Playlist, isPlaying: boolean): string {
  const label = playlist.title ?? playlist.id;

  return isPlaying ? `${label} ▶` : label;
}

function comparePlaylistsByCreatedAtDesc(left: Playlist, right: Playlist): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function Popup() {
  const [popupState, { refetch }] = createResource(getPopupState);
  const [feedback, setFeedback] = createSignal<string | null>(null);
  const [manualScrollRequestKey, setManualScrollRequestKey] = createSignal(0);
  const [playbackSettingsDraft, setPlaybackSettingsDraft] = createSignal<PlaybackSettings | null>(
    null,
  );
  const [showPlaybackSettings, setShowPlaybackSettings] = createSignal(false);
  const [showMemoEditor, setShowMemoEditor] = createSignal(false);
  const [memoDraftPlaylistId, setMemoDraftPlaylistId] = createSignal<PlaylistId | null>(null);
  const [memoDraft, setMemoDraft] = createSignal("");
  const [aliveTabIdByPlaylistId, setAliveTabIdByPlaylistId] = createSignal<
    Partial<Record<PlaylistId, number>>
  >({});
  const activePlaylist = createActivePlaylist(() => popupState());
  const selectablePlaylists = createMemo(() =>
    (popupState()?.playlists ?? []).toSorted(comparePlaylistsByCreatedAtDesc),
  );
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

    if (!activeTabId || !isWatchUrl(activeTabUrl)) {
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
  const pendingPlaybackEndNavigationIndex = () => {
    const playlist = activePlaylist();

    if (!playlist) {
      return null;
    }

    return popupState()?.pendingPlaybackEndNavigationByPlaylistId[playlist.id] ?? null;
  };
  const hasPlaylistPlaybackContext = (playlistId: PlaylistId) =>
    (popupState()?.playbackContexts ?? []).some((context) => context.playlistId === playlistId);
  const currentPlaybackSettings = () =>
    playbackSettingsDraft() ?? popupState()?.playbackSettings ?? null;
  const globalRepeatPresetLabel = createMemo(() => {
    const playbackSettings = currentPlaybackSettings();

    if (!playbackSettings?.activeRepeatPresetId) {
      return "なし";
    }

    const preset = playbackSettings.presets.find(
      (candidate) => candidate.id === playbackSettings.activeRepeatPresetId,
    );

    return preset ? formatRepeatPresetLabel(preset, { includeRepeatSuffix: false }) : "なし";
  });
  const playlistRepeatSelectValue = createMemo(() => {
    const repeatPresetId = activePlaylist()?.repeatPresetId;

    if (repeatPresetId === undefined) {
      return "global";
    }

    return repeatPresetId ?? "none";
  });
  const perVideoRepeatStatusLabel = createMemo(() => {
    const playbackSettings = currentPlaybackSettings();
    const playlist = activePlaylist();
    const effectiveRepeatPresetId =
      playlist?.repeatPresetId === undefined
        ? playbackSettings?.activeRepeatPresetId
        : playlist.repeatPresetId;

    if (!playbackSettings || !effectiveRepeatPresetId) {
      return "なし";
    }

    const activePreset = playbackSettings.presets.find(
      (preset) => preset.id === effectiveRepeatPresetId,
    );

    return activePreset
      ? formatRepeatPresetLabel(activePreset, { includeRepeatSuffix: false })
      : "なし";
  });
  const repeatStatusLabel = createMemo(() => {
    const playlistRepeatStatusLabel = currentPlaybackSettings()?.playlistRepeatEnabled
      ? "ON"
      : "OFF";

    return `↻ ${playlistRepeatStatusLabel} / ${perVideoRepeatStatusLabel()}`;
  });
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

  createEffect(() => {
    const playbackSettings = popupState()?.playbackSettings;

    if (!playbackSettings || playbackSettingsDraft()) {
      return;
    }

    setPlaybackSettingsDraft(playbackSettings);
  });

  createEffect(() => {
    const playlist = activePlaylist();

    if (!playlist || memoDraftPlaylistId() === playlist.id) {
      return;
    }

    setMemoDraft(playlist.memo ?? "");
    setMemoDraftPlaylistId(playlist.id);
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
        changes[STORAGE_KEYS.playbackContexts] ||
        changes[STORAGE_KEYS.playbackSettings]
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
    void browser.runtime.sendMessage({ type: "badge:refresh" });

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

  async function handleMovePlaybackIndex(
    index: number,
    transitionMode: PopupPlaybackTransitionMode = "immediate",
  ) {
    const state = popupState();
    const playlist = activePlaylist();
    const nextVideoId = playlist?.videoIds[index];
    const activeTabId = state?.activeTabId ?? null;
    const playbackTabIdValue = playbackTabId();

    if (!playlist || !nextVideoId) {
      setFeedback("現在のタブ情報を取得できません。");
      return;
    }

    setFeedback(null);

    try {
      const message: PopupMessage = {
        activeTabId,
        index,
        playbackTabId: playbackTabIdValue,
        playlistId: playlist.id,
        transitionMode,
        type: "popup:start-playback",
      };

      await browser.runtime.sendMessage(message);
      await refetch();
      if (transitionMode === "immediate") {
        window.close();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "再生位置の更新に失敗しました。");
    }
  }

  async function handleStepPlaybackIndex(direction: "previous" | "next") {
    const playbackIndex = currentPlaybackIndex();
    const playlist = activePlaylist();

    if (!playlist || playbackIndex === null) {
      return;
    }

    const nextIndex = direction === "previous" ? playbackIndex - 1 : playbackIndex + 1;

    if (nextIndex < 0 || nextIndex >= playlist.videoIds.length) {
      return;
    }

    await handleMovePlaybackIndex(nextIndex);
  }

  async function handleMovePlaybackIndexAfterCurrentEnded(index: number) {
    await handleMovePlaybackIndex(index, "after-current-ended");
  }

  async function handleStepPlaybackIndexAfterCurrentEnded(direction: "previous" | "next") {
    const playbackIndex = currentPlaybackIndex();
    const playlist = activePlaylist();

    if (!playlist || playbackIndex === null) {
      return;
    }

    const nextIndex = direction === "previous" ? playbackIndex - 1 : playbackIndex + 1;

    if (nextIndex < 0 || nextIndex >= playlist.videoIds.length) {
      return;
    }

    await handleMovePlaybackIndexAfterCurrentEnded(nextIndex);
  }

  async function handleOpenOptionsPage() {
    await browser.runtime.openOptionsPage();
    window.close();
  }

  async function handleSelectPlaylistRepeatPreset(nextValue: string) {
    const playlist = activePlaylist();

    if (!playlist) {
      setFeedback("プレイリストを取得できません。");
      return;
    }

    setFeedback(null);

    try {
      await updateStoredPlaylist(playlist.id, {
        repeatPresetId:
          nextValue === "global" ? undefined : nextValue === "none" ? null : nextValue,
      });

      await refetch();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "リピート設定の更新に失敗しました。");
    }
  }

  async function handleTogglePlaylistRepeatEnabled() {
    const playbackSettings = currentPlaybackSettings();

    if (!playbackSettings) {
      setFeedback("再生設定を取得できません。");
      return;
    }

    setFeedback(null);

    try {
      const nextPlaybackSettings = await updateStoredPlaybackSettings((currentPlaybackSettings) =>
        sanitizePlaybackSettings({
          ...currentPlaybackSettings,
          playlistRepeatEnabled: !currentPlaybackSettings.playlistRepeatEnabled,
        }),
      );

      setPlaybackSettingsDraft(nextPlaybackSettings);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "プレイリストリピートの更新に失敗しました。",
      );
    }
  }

  async function handleSavePlaylistMemo() {
    const playlist = activePlaylist();

    if (!playlist) {
      setFeedback("プレイリストを取得できません。");
      return;
    }

    setFeedback(null);

    try {
      const normalizedMemo = memoDraft().trim();

      await updateStoredPlaylist(playlist.id, {
        memo: normalizedMemo === "" ? undefined : normalizedMemo,
      });
      await refetch();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "プレイリストメモの更新に失敗しました。",
      );
    }
  }

  return (
    <main class="flex h-[600px] min-w-[30rem] max-w-[42rem] flex-col overflow-hidden bg-stone-950 text-stone-100">
      <div class="mx-auto flex h-full w-full min-h-0 flex-col gap-3 px-3 py-3">
        <div class="shrink-0 space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <h1 class="text-lg font-semibold text-stone-50">NiconiPlaylist</h1>
              <button
                type="button"
                onClick={() => void handleOpenOptionsPage()}
                class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-stone-700 bg-stone-900 text-xs text-stone-200 transition hover:bg-stone-800"
                title="オプションを開く"
                aria-label="オプションを開く"
              >
                ⚙
              </button>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Show
                when={showPlaybackSettings()}
                fallback={
                  <button
                    type="button"
                    onClick={() => setShowPlaybackSettings(true)}
                    class="max-w-32 truncate rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5 text-[10px] font-medium text-stone-300 transition hover:border-stone-600 hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
                    title="リピート設定を表示"
                    aria-label="リピート設定を表示"
                  >
                    {repeatStatusLabel()}
                  </button>
                }
              >
                <button
                  type="button"
                  onClick={() => setShowPlaybackSettings(false)}
                  class="max-w-32 truncate rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-medium text-stone-900 transition hover:border-stone-200 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
                  title="リピート設定を閉じる"
                  aria-label="リピート設定を閉じる"
                >
                  {repeatStatusLabel()}
                </button>
              </Show>
              <button
                type="button"
                onClick={() => setShowMemoEditor((value) => !value)}
                class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition ${
                  showMemoEditor()
                    ? "border-stone-300 bg-white text-stone-900"
                    : "border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800"
                }`}
                title="プレイリストメモを表示"
                aria-label="プレイリストメモを表示"
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => void handleStepPlaybackIndex("previous")}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void handleStepPlaybackIndexAfterCurrentEnded("previous");
                }}
                disabled={currentPlaybackIndex() === null || (currentPlaybackIndex() ?? 0) <= 0}
                class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600 ${
                  pendingPlaybackEndNavigationIndex() !== null &&
                  pendingPlaybackEndNavigationIndex() === (currentPlaybackIndex() ?? 0) - 1
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                    : "border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800"
                }`}
                title="前の動画へ移動"
                aria-label="前の動画へ移動"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => void handleStepPlaybackIndex("next")}
                onContextMenu={(event) => {
                  event.preventDefault();
                  void handleStepPlaybackIndexAfterCurrentEnded("next");
                }}
                disabled={
                  currentPlaybackIndex() === null ||
                  (currentPlaybackIndex() ?? -1) >= activePlaylistVideoCount() - 1
                }
                class={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs transition disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600 ${
                  pendingPlaybackEndNavigationIndex() !== null &&
                  pendingPlaybackEndNavigationIndex() === (currentPlaybackIndex() ?? -1) + 1
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                    : "border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800"
                }`}
                title="次の動画へ移動"
                aria-label="次の動画へ移動"
              >
                ▶
              </button>
            </div>
          </div>

          <Show when={feedback()}>
            {(message) => (
              <div class="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {message()}
              </div>
            )}
          </Show>
        </div>

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
            <div class="flex min-h-0 flex-1 flex-col gap-3">
              <div class="shrink-0 space-y-3">
                <Show when={showPlaybackSettings()}>
                  <div class="flex flex-wrap items-center gap-3 rounded-xl bg-stone-900/40 px-3">
                    <div class="flex items-center gap-[2px]">
                      <span class="text-xs font-medium text-stone-200">プレイリスト全体:</span>
                      <button
                        type="button"
                        class={`inline-flex w-12 justify-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                          currentPlaybackSettings()?.playlistRepeatEnabled
                            ? "border-stone-500 bg-stone-800 text-stone-100 hover:border-stone-400 hover:bg-stone-700"
                            : "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                        }`}
                        onClick={() => void handleTogglePlaylistRepeatEnabled()}
                      >
                        {currentPlaybackSettings()?.playlistRepeatEnabled ? "ON" : "OFF"}
                      </button>
                    </div>

                    <div class="flex items-center gap-[2px]">
                      <span class="text-xs font-medium text-stone-200">各動画:</span>
                      <select
                        class="rounded-md border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                        value={playlistRepeatSelectValue()}
                        onChange={(event) =>
                          void handleSelectPlaylistRepeatPreset(event.currentTarget.value)
                        }
                      >
                        <option value="global">共通（{globalRepeatPresetLabel()}）</option>
                        <option value="none">なし</option>
                        <For each={currentPlaybackSettings()?.presets ?? []}>
                          {(preset) => (
                            <option value={preset.id}>
                              {formatRepeatPresetLabel(preset, {
                                includeRepeatSuffix: false,
                              })}
                            </option>
                          )}
                        </For>
                      </select>
                    </div>
                  </div>
                </Show>

                <div class="flex items-center gap-2">
                  <select
                    class="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                    value={popupState()?.lastActivePlaylistId ?? ""}
                    onChange={(event) => void handleActivate(event.currentTarget.value)}
                  >
                    <For each={selectablePlaylists()}>
                      {(playlist) => (
                        <option value={playlist.id}>
                          {formatPlaylistOptionLabel(
                            playlist,
                            hasPlaylistPlaybackContext(playlist.id),
                          )}
                        </option>
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
                    {activePlaylistVideoCount()}
                  </button>
                </div>

                <Show when={showMemoEditor() && activePlaylist()}>
                  {(playlist) => {
                    const isMemoDirty = () => (playlist().memo ?? "") !== memoDraft();

                    return (
                      <div class="space-y-2 rounded-xl bg-stone-900/40 px-3 py-3">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-xs font-medium text-stone-200">プレイリストメモ</span>
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              isMemoDirty()
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                : "border-stone-600 text-stone-400"
                            }`}
                            onClick={() => void handleSavePlaylistMemo()}
                            disabled={!isMemoDirty()}
                          >
                            保存
                          </button>
                        </div>
                        <textarea
                          class="h-28 max-h-40 min-h-24 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none transition focus:border-stone-500"
                          value={memoDraft()}
                          onInput={(event) => setMemoDraft(event.currentTarget.value)}
                          placeholder="このプレイリストのメモ"
                        />
                      </div>
                    );
                  }}
                </Show>

                <Show when={activePlaylist() && !showMemoEditor() && activePlaylist()?.memo}>
                  {(memo) => (
                    <p class="overflow-hidden text-xs leading-5 text-stone-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {memo()}
                    </p>
                  )}
                </Show>
              </div>

              <Show when={activePlaylist()}>
                {(playlist) => (
                  <div class="min-h-0 flex-1">
                    <PopupPlaylistVideoList
                      autoScrollKey={autoScrollKey()}
                      currentPlaybackIndex={currentPlaybackIndex()}
                      hasPlaybackTab={playbackTabId() !== null}
                      manualScrollRequestKey={manualScrollRequestKey()}
                      pendingPlaybackEndNavigationIndex={pendingPlaybackEndNavigationIndex()}
                      onFocusPlaybackTab={() => void handleFocusPlaybackTab()}
                      onMovePlaybackIndexAfterCurrentEnded={(index) =>
                        void handleMovePlaybackIndexAfterCurrentEnded(index)
                      }
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
