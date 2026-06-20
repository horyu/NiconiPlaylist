import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import { browser } from "wxt/browser";

import { createPlaylistJsonFilename, exportPlaylistJson } from "@/background/services/playlistJson";
import {
  activateStoredPlaylist,
  clearStoredPlaybackContextsByPlaylistId,
  createStoredPlaylistCopy,
  createShuffledStoredPlaylistCopy,
  deleteStoredPlaylist,
  updateStoredPlaylist,
} from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { formatSlashTimestampWithSeconds } from "@/lib/dateTime";
import { buildSharedPlaylistUrl } from "@/lib/playlistUrl";
import type { PopupMessage } from "@/lib/popupMessages";
import { normalizeOptionalText } from "@/lib/text";
import type { Playlist, PlaylistId } from "@/lib/types";
import { PlaylistActionMenu } from "@/options/components/PlaylistActionMenu";
import { PlaylistDetailVideoList } from "@/options/components/PlaylistDetailVideoList";
import { PlaylistListPane } from "@/options/components/PlaylistListPane";
import { PlaylistShareUrlPanel } from "@/options/components/PlaylistShareUrlPanel";
import { PlaylistVideoAppendForm } from "@/options/components/PlaylistVideoAppendForm";
import { usePlaylistDetailEditor } from "@/options/hooks/usePlaylistDetailEditor";
import type { PlaylistsState } from "@/options/hooks/usePlaylistsState";
import type { VideoMetadataState } from "@/options/hooks/useVideoMetadataState";
import type { OptionsToast } from "@/options/toast";

type ShareUrlKind = "id-only" | "with-title" | "with-title-and-memo";
type PlaylistJsonExportKind = "without-title" | "with-title" | "with-title-and-memo";

type ShareInfo = {
  playlistId: PlaylistId;
  byteCount: number;
  displayUrl: string;
  formatLabel: string;
};

const SHARE_OPTIONS: readonly { label: string; value: ShareUrlKind }[] = [
  { label: "動画IDのみ", value: "id-only" },
  { label: "タイトル付き", value: "with-title" },
  { label: "タイトル・メモ付き", value: "with-title-and-memo" },
];

const JSON_EXPORT_OPTIONS: readonly { label: string; value: PlaylistJsonExportKind }[] = [
  { label: "タイトルなし", value: "without-title" },
  { label: "タイトル付き", value: "with-title" },
  { label: "タイトル・メモ付き", value: "with-title-and-memo" },
];

type PlaylistsTabProps = {
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
  loading: boolean;
  error: unknown;
  playlistSelectionRequest: { playlistId: string; requestKey: number } | null;
  onActivated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onUpdated: () => Promise<void> | void;
  onFeedback: (toast: OptionsToast | null) => void;
};

function getPlaylistLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function comparePlaylistsByCreatedAtDesc(left: Playlist, right: Playlist): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function createTimestampTitle(): string {
  return formatSlashTimestampWithSeconds(new Date());
}

function formatPlaylistTimestamp(timestamp: string): string {
  return formatSlashTimestampWithSeconds(new Date(timestamp)).slice(0, -3);
}

function getPlaylistTimestampText(timestamp: string | null, emptyLabel: string): string {
  return timestamp === null ? emptyLabel : formatPlaylistTimestamp(timestamp);
}

function getPlaylistTimestampTitle(timestamp: string | null): string | undefined {
  return timestamp === null ? undefined : formatSlashTimestampWithSeconds(new Date(timestamp));
}

function getShareFormatLabel(kind: ShareUrlKind): string {
  switch (kind) {
    case "id-only":
      return "動画IDのみ";
    case "with-title":
      return "タイトル付き";
    case "with-title-and-memo":
      return "タイトル・メモ付き";
  }
}

export function PlaylistsTab(props: PlaylistsTabProps) {
  const [playlistQuery, setPlaylistQuery] = createSignal("");
  const [selectedPlaylistId, setSelectedPlaylistId] = createSignal<PlaylistId | null>(null);
  const [lastHandledPlaylistSelectionRequestKey, setLastHandledPlaylistSelectionRequestKey] =
    createSignal<number | null>(null);
  const [exportingPlaylistJson, setExportingPlaylistJson] = createSignal(false);
  const [detailInfoOpen, setDetailInfoOpen] = createSignal(false);
  const [openShareMenuPlaylistId, setOpenShareMenuPlaylistId] = createSignal<PlaylistId | null>(
    null,
  );
  const [shareInfo, setShareInfo] = createSignal<ShareInfo | null>(null);
  const [shareCopied, setShareCopied] = createSignal(false);
  const [openPlaylistJsonExportMenuPlaylistId, setOpenPlaylistJsonExportMenuPlaylistId] =
    createSignal<PlaylistId | null>(null);
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

  createEffect(() => {
    const request = props.playlistSelectionRequest;

    if (!request) {
      return;
    }

    if (lastHandledPlaylistSelectionRequestKey() === request.requestKey) {
      return;
    }

    if (!props.state?.playlists.some((playlist) => playlist.id === request.playlistId)) {
      return;
    }

    setLastHandledPlaylistSelectionRequestKey(request.requestKey);
    setPlaylistQuery("");
    setSelectedPlaylistId(request.playlistId as PlaylistId);
  });

  const sortedPlaylists = createMemo(() =>
    (props.state?.playlists ?? []).toSorted(comparePlaylistsByCreatedAtDesc),
  );

  const filteredPlaylists = createMemo(() => {
    const playlists = sortedPlaylists();
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
  const {
    appendVideos: handleAppendDraftVideos,
    cancelEditing: handleCancelEditingDetail,
    detailDraft,
    detailDraftResetKey,
    detailReadonlyVideoRows,
    detailVideoInput,
    detailVideoInsertIndexInput,
    detailVideoInsertPosition,
    dropVideo: handleDropDraftVideo,
    hasDetailUnsavedChanges,
    isEditingDetail,
    moveVideo: handleMoveDraftVideo,
    save: handleSaveDetail,
    setDetailDraft,
    setDetailVideoInput,
    setDetailVideoInsertIndexInput,
    setDetailVideoInsertPosition,
    setVideoDeleted: handleSetDraftVideoDeleted,
    startEditing: handleStartEditingDetail,
  } = usePlaylistDetailEditor({
    createFallbackTitle: createTimestampTitle,
    onFeedback: (toast) => props.onFeedback(toast),
    onUpdated: () => props.onUpdated(),
    selectedPlaylist,
  });
  const selectedPlaybackContext = createMemo(
    () =>
      props.state?.playbackContexts.find(
        (playbackContext) => playbackContext.playlistId === selectedPlaylistId(),
      ) ?? null,
  );
  const currentPlaybackIndex = createMemo(() => selectedPlaybackContext()?.currentIndex ?? null);

  onCleanup(() => {
    if (shareCopiedTimer) {
      clearTimeout(shareCopiedTimer);
    }
  });

  async function handleActivate(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      await activateStoredPlaylist(playlistId);
      props.onFeedback({
        text: "アクティブなプレイリストを更新しました。",
        tone: "success",
      });
      await props.onActivated();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの選択に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleDelete(playlistId: PlaylistId, title: string) {
    if (!window.confirm(`「${title}」を削除しますか？`)) {
      return;
    }
    props.onFeedback(null);

    try {
      await deleteStoredPlaylist(playlistId);
      props.onFeedback({ text: "プレイリストを削除しました。", tone: "success" });
      setOpenShareMenuPlaylistId((currentId) => (currentId === playlistId ? null : currentId));
      setOpenPlaylistJsonExportMenuPlaylistId((currentId) =>
        currentId === playlistId ? null : currentId,
      );
      setShareInfo((currentInfo) => (currentInfo?.playlistId === playlistId ? null : currentInfo));
      if (currentSharedUrlPlaylistId === playlistId) {
        currentSharedUrl = "";
        currentSharedUrlPlaylistId = null;
      }
      await props.onDeleted();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの削除に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleClearPlaybackState(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      await clearStoredPlaybackContextsByPlaylistId(playlistId, "manual-remove-from-options");
      await props.onUpdated();
      props.onFeedback({
        text: "再生状態を削除しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "再生状態の削除に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleCreateShuffledCopy(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      const nextPlaylist = await createShuffledStoredPlaylistCopy(playlistId);

      await props.onUpdated();
      setSelectedPlaylistId(nextPlaylist.id);
      props.onFeedback({
        text: "シャッフル済みプレイリストを作成しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text:
          error instanceof Error
            ? error.message
            : "シャッフル済みプレイリストの作成に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleCreateCopy(playlistId: PlaylistId) {
    props.onFeedback(null);

    try {
      const nextPlaylist = await createStoredPlaylistCopy(playlistId);

      await props.onUpdated();
      setSelectedPlaylistId(nextPlaylist.id);
      props.onFeedback({
        text: "プレイリストを複製しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの複製に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleSetPopupHidden(playlistId: PlaylistId, popupHidden: boolean) {
    props.onFeedback(null);

    try {
      await updateStoredPlaylist(playlistId, {
        popupHidden,
      });
      await props.onUpdated();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "popup表示設定の更新に失敗しました。",
        tone: "error",
      });
    }
  }

  async function handleStartPlayback(playlistId: PlaylistId) {
    const playlist = selectedPlaylist();
    const playbackContext = selectedPlaybackContext();
    const startIndex = playbackContext?.currentIndex ?? 0;

    if (!playlist || playlist.id !== playlistId || !playlist.videoIds[startIndex]) {
      props.onFeedback({
        text: "再生できる動画が見つかりません。",
        tone: "error",
      });
      return;
    }

    props.onFeedback(null);

    try {
      const playbackTabId = (() => playbackContext?.tabId ?? null)();

      if (props.state?.lastActivePlaylistId !== playlistId) {
        await activateStoredPlaylist(playlistId);
      }

      const reusablePlaybackTabId =
        playbackTabId !== null
          ? await browser.tabs
              .get(playbackTabId)
              .then((tab) => (typeof tab.id === "number" ? tab.id : null))
              .catch(() => null)
          : null;

      const message: PopupMessage = {
        activeTabId: null,
        index: startIndex,
        playbackTabId: reusablePlaybackTabId,
        playlistId,
        type: "popup:start-playback",
      };

      await browser.runtime.sendMessage(message);
      await props.onActivated();
      props.onFeedback({
        text: playbackContext
          ? "プレイリストを再開しました。"
          : "プレイリストの再生を開始しました。",
        tone: "success",
      });
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの再生開始に失敗しました。",
        tone: "error",
      });
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
      displayUrl: url,
      formatLabel: getShareFormatLabel(kind),
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
      props.onFeedback({
        text: error instanceof Error ? error.message : "共有 URL のコピーに失敗しました。",
        tone: "error",
      });
    }
  }

  function handleCloseSharedUrl() {
    currentSharedUrl = "";
    currentSharedUrlPlaylistId = null;
    setShareCopied(false);
    setShareInfo(null);
  }

  async function handleExportPlaylistJson(playlistId: PlaylistId, kind: PlaylistJsonExportKind) {
    props.onFeedback(null);
    setExportingPlaylistJson(true);
    setOpenPlaylistJsonExportMenuPlaylistId(null);

    try {
      const exportedPlaylist = await exportPlaylistJson(playlistId, {
        includeTitle: kind !== "without-title",
        includeMemo: kind === "with-title-and-memo",
      });
      const blob = new Blob([JSON.stringify(exportedPlaylist, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = createPlaylistJsonFilename();
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      props.onFeedback({
        text:
          error instanceof Error
            ? error.message
            : "プレイリスト JSON のエクスポートに失敗しました。",
        tone: "error",
      });
    } finally {
      setExportingPlaylistJson(false);
    }
  }

  return (
    <section class="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 shadow-lg shadow-black/20">
      <div class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold text-stone-50">保存済みプレイリスト</h2>
        <p class="text-sm text-stone-400">
          保存済みプレイリストの編集、共有、複製、書き出しを行います。
        </p>
      </div>

      <Switch
        fallback={
          <p class="text-sm leading-6 text-stone-400">
            保存済みプレイリストはまだありません。インポートタブで取り込むか、作成タブから新しく作成してください。
          </p>
        }
      >
        <Match when={props.loading && !props.state}>
          <p class="text-sm text-stone-400">読み込み中...</p>
        </Match>

        <Match when={props.error}>
          <p class="text-sm text-red-300">保存済みプレイリストを取得できませんでした。</p>
        </Match>

        <Match when={props.state?.playlists.length}>
          <div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <PlaylistListPane
              activePlaylistId={props.state?.lastActivePlaylistId}
              playlists={filteredPlaylists()}
              query={playlistQuery()}
              selectedPlaylistId={selectedPlaylistId()}
              onQueryInput={setPlaylistQuery}
              onSelect={setSelectedPlaylistId}
            />

            <section class="min-w-0 space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
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
                    <div class="min-w-0 space-y-4">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 flex-1 space-y-1">
                          <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                            Playlist Detail
                          </p>
                          <Show
                            when={isEditingDetail()}
                            fallback={
                              <h3 class="break-words text-xl font-semibold text-stone-50">
                                {getPlaylistLabel(detailPlaylist)}
                              </h3>
                            }
                          >
                            <input
                              type="text"
                              class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-xl font-semibold text-stone-50 outline-none transition focus:border-stone-500"
                              value={detailDraft().title}
                              onInput={(event) =>
                                setDetailDraft((currentDraft) => ({
                                  ...currentDraft,
                                  title: event.currentTarget.value,
                                }))
                              }
                              placeholder="プレイリスト名"
                            />
                          </Show>
                          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                            <span>{detailPlaylist.videoIds.length} videos</span>
                            <Show when={currentPlaybackIndex() !== null}>
                              <>
                                <span class="text-stone-600">•</span>
                                <span>再生中: {(currentPlaybackIndex() ?? 0) + 1}</span>
                              </>
                            </Show>
                            <Show
                              when={
                                detailPlaylist.lastCompletedAt !== null &&
                                currentPlaybackIndex() === null
                              }
                            >
                              <>
                                <span class="text-stone-600">•</span>
                                <span
                                  title={getPlaylistTimestampTitle(detailPlaylist.lastCompletedAt)}
                                >
                                  再生完了
                                </span>
                              </>
                            </Show>
                            <span class="text-stone-600">•</span>
                            <Show when={detailPlaylist.id === props.state?.lastActivePlaylistId}>
                              <>
                                <span class="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                                  Active
                                </span>
                                <button
                                  type="button"
                                  class={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                                    detailPlaylist.popupHidden
                                      ? "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                  }`}
                                  onClick={() =>
                                    void handleSetPopupHidden(
                                      detailPlaylist.id,
                                      !detailPlaylist.popupHidden,
                                    )
                                  }
                                >
                                  {detailPlaylist.popupHidden ? "popupに表示" : "popup表示中"}
                                </button>
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-2.5 py-0.5 text-[11px] font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                  onClick={() => void handleStartPlayback(detailPlaylist.id)}
                                >
                                  {selectedPlaybackContext() ? "再開" : "再生開始"}
                                </button>
                                <Show when={selectedPlaybackContext()}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-stone-600 px-2.5 py-0.5 text-[11px] font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                    onClick={() => void handleClearPlaybackState(detailPlaylist.id)}
                                  >
                                    再生状態を削除
                                  </button>
                                </Show>
                              </>
                            </Show>
                            <Show when={detailPlaylist.id !== props.state?.lastActivePlaylistId}>
                              <>
                                <button
                                  type="button"
                                  class={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                                    detailPlaylist.popupHidden
                                      ? "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                                      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                                  }`}
                                  onClick={() =>
                                    void handleSetPopupHidden(
                                      detailPlaylist.id,
                                      !detailPlaylist.popupHidden,
                                    )
                                  }
                                >
                                  {detailPlaylist.popupHidden ? "popupに表示" : "popup表示中"}
                                </button>
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-2.5 py-0.5 text-[11px] font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                  onClick={() => void handleActivate(detailPlaylist.id)}
                                >
                                  選択
                                </button>
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-2.5 py-0.5 text-[11px] font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                  onClick={() => void handleStartPlayback(detailPlaylist.id)}
                                >
                                  {selectedPlaybackContext() ? "再開" : "再生開始"}
                                </button>
                                <Show when={selectedPlaybackContext()}>
                                  <button
                                    type="button"
                                    class="rounded-full border border-stone-600 px-2.5 py-0.5 text-[11px] font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                    onClick={() => void handleClearPlaybackState(detailPlaylist.id)}
                                  >
                                    再生状態を削除
                                  </button>
                                </Show>
                              </>
                            </Show>
                            <button
                              type="button"
                              class="text-stone-500 transition hover:text-stone-300"
                              onClick={() => setDetailInfoOpen((current) => !current)}
                            >
                              詳細情報
                            </button>
                            <Show when={detailInfoOpen()}>
                              <>
                                <span
                                  title={getPlaylistTimestampTitle(detailPlaylist.lastPlayedAt)}
                                >
                                  最終再生:{" "}
                                  <span class="text-stone-200">
                                    {getPlaylistTimestampText(
                                      detailPlaylist.lastPlayedAt,
                                      "未再生",
                                    )}
                                  </span>
                                </span>
                                <span class="text-stone-600">•</span>
                                <span title={getPlaylistTimestampTitle(detailPlaylist.updatedAt)}>
                                  最終更新:{" "}
                                  <span class="text-stone-200">
                                    {formatPlaylistTimestamp(detailPlaylist.updatedAt)}
                                  </span>
                                </span>
                                <span class="text-stone-600">•</span>
                                <span title={getPlaylistTimestampTitle(detailPlaylist.createdAt)}>
                                  作成:{" "}
                                  <span class="text-stone-200">
                                    {formatPlaylistTimestamp(detailPlaylist.createdAt)}
                                  </span>
                                </span>
                              </>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Show
                          when={isEditingDetail()}
                          fallback={
                            <>
                              <button
                                type="button"
                                class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={handleStartEditingDetail}
                              >
                                編集
                              </button>
                              <PlaylistActionMenu
                                buttonLabel="共有"
                                open={openShareMenuPlaylistId() === detailPlaylist.id}
                                options={SHARE_OPTIONS}
                                onSelect={(kind) =>
                                  handleCreateSharedUrl(
                                    detailPlaylist.id,
                                    detailPlaylist.videoIds,
                                    detailPlaylist.title,
                                    detailPlaylist.memo,
                                    kind as ShareUrlKind,
                                  )
                                }
                                onToggle={() =>
                                  setOpenShareMenuPlaylistId((currentId) =>
                                    currentId === detailPlaylist.id ? null : detailPlaylist.id,
                                  )
                                }
                              />
                              <PlaylistActionMenu
                                buttonLabel="JSON エクスポート"
                                disabled={exportingPlaylistJson()}
                                open={openPlaylistJsonExportMenuPlaylistId() === detailPlaylist.id}
                                options={JSON_EXPORT_OPTIONS}
                                onSelect={(kind) =>
                                  void handleExportPlaylistJson(
                                    detailPlaylist.id,
                                    kind as PlaylistJsonExportKind,
                                  )
                                }
                                onToggle={() =>
                                  setOpenPlaylistJsonExportMenuPlaylistId((currentId) =>
                                    currentId === detailPlaylist.id ? null : detailPlaylist.id,
                                  )
                                }
                              />
                              <button
                                type="button"
                                class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={() => void handleCreateCopy(detailPlaylist.id)}
                              >
                                複製
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                                onClick={() => void handleCreateShuffledCopy(detailPlaylist.id)}
                              >
                                シャッフル複製
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-400/50 hover:bg-red-500/10"
                                onClick={() =>
                                  void handleDelete(
                                    detailPlaylist.id,
                                    getPlaylistLabel(detailPlaylist),
                                  )
                                }
                              >
                                削除
                              </button>
                            </>
                          }
                        >
                          <button
                            type="button"
                            class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                              hasDetailUnsavedChanges()
                                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                                : "border-stone-600 text-stone-200 hover:border-stone-500 hover:bg-stone-800"
                            }`}
                            onClick={() => void handleSaveDetail()}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                            onClick={handleCancelEditingDetail}
                          >
                            キャンセル
                          </button>
                        </Show>
                      </div>

                      <div class="rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3">
                        <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                          Memo
                        </p>
                        <Show
                          when={isEditingDetail()}
                          fallback={
                            <Show when={detailPlaylist.memo}>
                              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                                {detailPlaylist.memo}
                              </p>
                            </Show>
                          }
                        >
                          <textarea
                            rows="5"
                            class="mt-2 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm leading-6 text-stone-200 outline-none transition focus:border-stone-500"
                            value={detailDraft().memo}
                            onInput={(event) =>
                              setDetailDraft((currentDraft) => ({
                                ...currentDraft,
                                memo: event.currentTarget.value,
                              }))
                            }
                            placeholder="メモ"
                          />
                        </Show>
                      </div>

                      <Show when={isEditingDetail()}>
                        <PlaylistVideoAppendForm
                          indexInput={detailVideoInsertIndexInput()}
                          input={detailVideoInput()}
                          position={detailVideoInsertPosition()}
                          onAdd={handleAppendDraftVideos}
                          onIndexInput={setDetailVideoInsertIndexInput}
                          onInput={setDetailVideoInput}
                          onPositionChange={setDetailVideoInsertPosition}
                        />
                      </Show>

                      <Show when={playlistShareInfo()}>
                        {(info) => (
                          <PlaylistShareUrlPanel
                            byteCount={info().byteCount}
                            copied={shareCopied()}
                            displayUrl={info().displayUrl}
                            formatLabel={info().formatLabel}
                            url={hasCurrentSharedUrl() ? currentSharedUrl : undefined}
                            onClose={handleCloseSharedUrl}
                            onCopy={() => void handleCopySharedUrl()}
                          />
                        )}
                      </Show>

                      <PlaylistDetailVideoList
                        videoRows={
                          isEditingDetail() ? detailDraft().videoRows : detailReadonlyVideoRows()
                        }
                        videoMetadataState={props.videoMetadataState}
                        currentPlaybackIndex={currentPlaybackIndex()}
                        isEditing={isEditingDetail()}
                        onDropVideo={handleDropDraftVideo}
                        onMoveVideo={handleMoveDraftVideo}
                        resetKey={detailDraftResetKey()}
                        onSetVideoDeleted={handleSetDraftVideoDeleted}
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
