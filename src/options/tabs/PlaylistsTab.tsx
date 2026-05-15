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
import { parseVideoIdInputLines } from "@/lib/videoIdInput";
import { PlaylistDetailVideoList } from "@/options/components/PlaylistDetailVideoList";
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

type DetailDraftVideoRow = {
  originalIndex: number | null;
  rowId: string;
  videoId: string;
};

type DetailDraft = {
  memo: string;
  title: string;
  videoRows: DetailDraftVideoRow[];
};

type VideoInsertPosition = "append" | "prepend" | "after-current" | "before-index" | "after-index";

type PlaylistsTabProps = {
  state: PlaylistsState | undefined;
  videoMetadataState: VideoMetadataState | undefined;
  loading: boolean;
  error: unknown;
  onActivated: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onUpdated: () => Promise<void> | void;
  onFeedback: (toast: OptionsToast | null) => void;
};

function getPlaylistLabel(playlist: Playlist): string {
  return playlist.title ?? playlist.id;
}

function createTimestampTitle(): string {
  return formatSlashTimestampWithSeconds(new Date());
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

function getPlaylistJsonFormatLabel(kind: PlaylistJsonExportKind): string {
  switch (kind) {
    case "without-title":
      return "タイトルなし";
    case "with-title":
      return "タイトル付き";
    case "with-title-and-memo":
      return "タイトル・メモ付き";
  }
}

function createDetailDraftVideoRow(
  videoId: string,
  originalIndex: number | null,
): DetailDraftVideoRow {
  return {
    originalIndex,
    rowId: crypto.randomUUID(),
    videoId,
  };
}

function createDetailDraftVideoRows(videoIds: string[]): DetailDraftVideoRow[] {
  return videoIds.map((videoId, index) => createDetailDraftVideoRow(videoId, index));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function PlaylistsTab(props: PlaylistsTabProps) {
  const [playlistQuery, setPlaylistQuery] = createSignal("");
  const [selectedPlaylistId, setSelectedPlaylistId] = createSignal<PlaylistId | null>(null);
  const [exportingPlaylistJson, setExportingPlaylistJson] = createSignal(false);
  const [isEditingDetail, setIsEditingDetail] = createSignal(false);
  const [detailVideoInput, setDetailVideoInput] = createSignal("");
  const [detailVideoInsertPosition, setDetailVideoInsertPosition] =
    createSignal<VideoInsertPosition>("append");
  const [detailVideoInsertIndexInput, setDetailVideoInsertIndexInput] = createSignal("1");
  const [detailReadonlyVideoRows, setDetailReadonlyVideoRows] = createSignal<DetailDraftVideoRow[]>(
    [],
  );
  const [detailReadonlyVideoRowsKey, setDetailReadonlyVideoRowsKey] = createSignal("");
  const [detailDraft, setDetailDraft] = createSignal<DetailDraft>({
    memo: "",
    title: "",
    videoRows: [],
  });
  const [deletedDraftVideoCount, setDeletedDraftVideoCount] = createSignal(0);
  const [hasDraftVideoChanges, setHasDraftVideoChanges] = createSignal(false);
  const [detailDraftResetKey, setDetailDraftResetKey] = createSignal(0);
  const [detailDraftPlaylistId, setDetailDraftPlaylistId] = createSignal<PlaylistId | null>(null);
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
  let deletedDraftVideoRowIds = new Set<string>();

  createEffect(() => {
    const playlists = props.state?.playlists ?? [];
    const videoIds = playlists.flatMap((playlist) => playlist.videoIds);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  createEffect(() => {
    if (!isEditingDetail()) {
      return;
    }

    const videoIds = detailDraft().videoRows.map((videoRow) => videoRow.videoId);

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
    const playlists = (props.state?.playlists ?? []).slice().reverse();
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
  const selectedPlaybackContext = createMemo(
    () =>
      props.state?.playbackContexts.find(
        (playbackContext) => playbackContext.playlistId === selectedPlaylistId(),
      ) ?? null,
  );
  const currentPlaybackIndex = createMemo(() => selectedPlaybackContext()?.currentIndex ?? null);

  createEffect(() => {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    if (detailDraftPlaylistId() === playlist.id) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoRows: createDetailDraftVideoRows(playlist.videoIds),
    });
    deletedDraftVideoRowIds = new Set<string>();
    setDeletedDraftVideoCount(0);
    setHasDraftVideoChanges(false);
    setDetailVideoInput("");
    setDetailVideoInsertPosition("append");
    setDetailVideoInsertIndexInput("1");
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setDetailDraftPlaylistId(playlist.id);
    setIsEditingDetail(false);
  });

  createEffect(() => {
    const playlist = selectedPlaylist();

    if (!playlist) {
      setDetailReadonlyVideoRows([]);
      setDetailReadonlyVideoRowsKey("");
      return;
    }

    const nextKey = `${playlist.id}:${playlist.videoIds.join("\u0000")}`;

    if (detailReadonlyVideoRowsKey() === nextKey) {
      return;
    }

    setDetailReadonlyVideoRows(createDetailDraftVideoRows(playlist.videoIds));
    setDetailReadonlyVideoRowsKey(nextKey);
  });

  const hasDetailUnsavedChanges = createMemo(() => {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return false;
    }

    const draft = detailDraft();

    return (
      draft.title !== (playlist.title ?? "") ||
      draft.memo !== (playlist.memo ?? "") ||
      deletedDraftVideoCount() > 0 ||
      hasDraftVideoChanges()
    );
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
      await clearStoredPlaybackContextsByPlaylistId(playlistId);
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

  function handleStartEditingDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoRows: createDetailDraftVideoRows(playlist.videoIds),
    });
    deletedDraftVideoRowIds = new Set<string>();
    setDeletedDraftVideoCount(0);
    setHasDraftVideoChanges(false);
    setDetailVideoInput("");
    setDetailVideoInsertPosition("append");
    setDetailVideoInsertIndexInput("1");
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setDetailDraftPlaylistId(playlist.id);
    setIsEditingDetail(true);
    props.onFeedback(null);
  }

  function handleCancelEditingDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    setDetailDraft({
      memo: playlist.memo ?? "",
      title: playlist.title ?? "",
      videoRows: createDetailDraftVideoRows(playlist.videoIds),
    });
    deletedDraftVideoRowIds = new Set<string>();
    setDeletedDraftVideoCount(0);
    setHasDraftVideoChanges(false);
    setDetailVideoInput("");
    setDetailVideoInsertPosition("append");
    setDetailVideoInsertIndexInput("1");
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setIsEditingDetail(false);
    props.onFeedback(null);
  }

  async function handleSaveDetail() {
    const playlist = selectedPlaylist();

    if (!playlist) {
      return;
    }

    props.onFeedback(null);

    try {
      const draft = detailDraft();
      const deletedVideoIndices = draft.videoRows
        .filter(
          (videoRow) =>
            videoRow.originalIndex !== null && deletedDraftVideoRowIds.has(videoRow.rowId),
        )
        .map((videoRow) => videoRow.originalIndex!)
        .sort((a, b) => a - b);

      await updateStoredPlaylist(
        playlist.id,
        {
          memo: normalizeOptionalText(draft.memo),
          title: normalizeOptionalText(draft.title) ?? createTimestampTitle(),
          videoIds: draft.videoRows
            .filter((videoRow) => !deletedDraftVideoRowIds.has(videoRow.rowId))
            .map((videoRow) => videoRow.videoId),
        },
        {
          deletedVideoIndices,
        },
      );
      deletedDraftVideoRowIds = new Set<string>();
      setDeletedDraftVideoCount(0);
      setHasDraftVideoChanges(false);
      setDetailVideoInput("");
      setDetailDraftResetKey((currentKey) => currentKey + 1);
      setIsEditingDetail(false);
      props.onFeedback({ text: "プレイリストを更新しました。", tone: "success" });
      await props.onUpdated();
    } catch (error) {
      props.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの更新に失敗しました。",
        tone: "error",
      });
    }
  }

  function handleSetDraftVideoDeleted(rowId: string, isDeleted: boolean) {
    const hasRowId = deletedDraftVideoRowIds.has(rowId);

    if (isDeleted && !hasRowId) {
      deletedDraftVideoRowIds.add(rowId);
      setDeletedDraftVideoCount((currentCount) => currentCount + 1);
      setHasDraftVideoChanges(true);
      return;
    }

    if (!isDeleted && hasRowId) {
      deletedDraftVideoRowIds.delete(rowId);
      setDeletedDraftVideoCount((currentCount) => currentCount - 1);
      setHasDraftVideoChanges(true);
    }
  }

  function handleAppendDraftVideos() {
    const value = detailVideoInput().trim();

    if (!value) {
      props.onFeedback({
        text: "watch URL または動画IDを入力してください。",
        tone: "error",
      });
      return;
    }

    try {
      const nextVideoIds = parseVideoIdInputLines(value);
      const nextVideoRows = nextVideoIds.map((videoId) => createDetailDraftVideoRow(videoId, null));

      setDetailDraft((currentDraft) => ({
        ...currentDraft,
        videoRows: (() => {
          const currentVideoRows = currentDraft.videoRows;
          const currentLength = currentVideoRows.length;

          const insertAt = (() => {
            switch (detailVideoInsertPosition()) {
              case "prepend":
                return 0;
              case "after-current": {
                const playbackIndex = currentPlaybackIndex();

                if (playbackIndex === null) {
                  return currentLength;
                }

                const currentRowIndex = currentVideoRows.findIndex(
                  (videoRow) => videoRow.originalIndex === playbackIndex,
                );

                return currentRowIndex >= 0 ? currentRowIndex + 1 : currentLength;
              }
              case "before-index":
              case "after-index": {
                const parsedIndex = Number.parseInt(detailVideoInsertIndexInput().trim(), 10);

                if (!Number.isFinite(parsedIndex)) {
                  return currentLength;
                }

                const normalizedIndex = clamp(parsedIndex, 1, Math.max(currentLength, 1));

                return detailVideoInsertPosition() === "before-index"
                  ? normalizedIndex - 1
                  : normalizedIndex;
              }
              case "append":
              default:
                return currentLength;
            }
          })();

          const safeInsertAt = clamp(insertAt, 0, currentLength);

          return [
            ...currentVideoRows.slice(0, safeInsertAt),
            ...nextVideoRows,
            ...currentVideoRows.slice(safeInsertAt),
          ];
        })(),
      }));
      setHasDraftVideoChanges(true);
      setDetailVideoInput("");
      props.onFeedback(null);
    } catch (error) {
      props.onFeedback({
        text:
          error instanceof Error
            ? error.message
            : "watch URL または動画IDの入力を解析できませんでした。",
        tone: "error",
      });
    }
  }

  function handleMoveDraftVideo(rowId: string, direction: "up" | "down") {
    const currentIndex = detailDraft().videoRows.findIndex((videoRow) => videoRow.rowId === rowId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0) {
      return;
    }

    setDetailDraft((currentDraft) => {
      if (targetIndex < 0 || targetIndex >= currentDraft.videoRows.length) {
        return currentDraft;
      }

      const nextVideoRows = [...currentDraft.videoRows];
      const [movedVideoRow] = nextVideoRows.splice(currentIndex, 1);

      nextVideoRows.splice(targetIndex, 0, movedVideoRow!);

      return {
        ...currentDraft,
        videoRows: nextVideoRows,
      };
    });
    setHasDraftVideoChanges(true);
    props.onFeedback(null);
  }

  function handleDropDraftVideo(
    sourceRowId: string,
    targetRowId: string,
    placement: "before" | "after",
  ) {
    if (sourceRowId === targetRowId) {
      return;
    }

    setDetailDraft((currentDraft) => {
      const sourceIndex = currentDraft.videoRows.findIndex(
        (videoRow) => videoRow.rowId === sourceRowId,
      );
      const targetIndex = currentDraft.videoRows.findIndex(
        (videoRow) => videoRow.rowId === targetRowId,
      );

      if (sourceIndex < 0 || targetIndex < 0) {
        return currentDraft;
      }

      const nextVideoRows = [...currentDraft.videoRows];
      const [movedVideoRow] = nextVideoRows.splice(sourceIndex, 1);

      let insertIndex = placement === "before" ? targetIndex : targetIndex + 1;

      if (sourceIndex < insertIndex) {
        insertIndex -= 1;
      }

      nextVideoRows.splice(insertIndex, 0, movedVideoRow!);

      return {
        ...currentDraft,
        videoRows: nextVideoRows,
      };
    });
    setHasDraftVideoChanges(true);
    props.onFeedback(null);
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
            保存済みプレイリストはまだありません。インポートタブで取り込むか、作成タブから
            新しく作成してください。
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
          <div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            <section class="min-w-0 space-y-4 rounded-2xl border border-stone-800 bg-stone-950/40 p-4">
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
                            <div class="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                              <span>{playlist.videoIds.length} videos</span>
                              <Show when={playlist.popupHidden}>
                                <span class="rounded-full border border-stone-700 bg-stone-900 px-2 py-0.5 text-[11px] font-medium text-stone-400">
                                  popup非表示
                                </span>
                              </Show>
                            </div>
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
                            <span class="text-stone-600">•</span>
                            <span>{detailPlaylist.id}</span>
                            <Show when={detailPlaylist.id === props.state?.lastActivePlaylistId}>
                              <>
                                <span class="text-stone-600">•</span>
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
                                <span class="text-stone-600">•</span>
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
                                      動画IDのみ
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
                              <div class="relative">
                                <button
                                  type="button"
                                  class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                                  onClick={() =>
                                    setOpenPlaylistJsonExportMenuPlaylistId((currentId) =>
                                      currentId === detailPlaylist.id ? null : detailPlaylist.id,
                                    )
                                  }
                                  disabled={exportingPlaylistJson()}
                                >
                                  JSON エクスポート
                                </button>
                                <Show
                                  when={
                                    openPlaylistJsonExportMenuPlaylistId() === detailPlaylist.id
                                  }
                                >
                                  <div class="absolute left-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 shadow-lg shadow-black/30">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleExportPlaylistJson(
                                          detailPlaylist.id,
                                          "without-title",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      {getPlaylistJsonFormatLabel("without-title")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleExportPlaylistJson(
                                          detailPlaylist.id,
                                          "with-title",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      {getPlaylistJsonFormatLabel("with-title")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleExportPlaylistJson(
                                          detailPlaylist.id,
                                          "with-title-and-memo",
                                        )
                                      }
                                      class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
                                    >
                                      {getPlaylistJsonFormatLabel("with-title-and-memo")}
                                    </button>
                                  </div>
                                </Show>
                              </div>
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
                        <div class="rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3">
                          <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="space-y-1">
                              <p class="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
                                Append Videos
                              </p>
                              <p class="text-sm text-stone-300">
                                watch URL / 動画ID を複数行で追加できます。
                              </p>
                            </div>
                            <button
                              type="button"
                              class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                              onClick={handleAppendDraftVideos}
                            >
                              追加
                            </button>
                          </div>
                          <div class="mt-3 grid gap-3 md:grid-cols-[180px_8rem]">
                            <label>
                              <select
                                aria-label="動画追加位置"
                                class="w-[170px] rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition focus:border-stone-500"
                                value={detailVideoInsertPosition()}
                                onChange={(event) =>
                                  setDetailVideoInsertPosition(
                                    event.currentTarget.value as VideoInsertPosition,
                                  )
                                }
                              >
                                <option value="append">末尾に追加</option>
                                <option value="prepend">先頭に追加</option>
                                <option value="after-current">再生中の次に追加</option>
                                <option value="before-index">指定位置の前に追加</option>
                                <option value="after-index">指定位置の後に追加</option>
                              </select>
                            </label>
                            <Show
                              when={
                                detailVideoInsertPosition() === "before-index" ||
                                detailVideoInsertPosition() === "after-index"
                              }
                              fallback={<div />}
                            >
                              <label>
                                <input
                                  type="number"
                                  min="1"
                                  aria-label="動画追加位置の番号"
                                  class="w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 outline-none transition focus:border-stone-500"
                                  value={detailVideoInsertIndexInput()}
                                  onInput={(event) =>
                                    setDetailVideoInsertIndexInput(event.currentTarget.value)
                                  }
                                  placeholder="1"
                                />
                              </label>
                            </Show>
                          </div>
                          <textarea
                            rows="3"
                            class="mt-3 w-full rounded-xl border border-stone-700 bg-stone-950 px-3 py-2 text-sm leading-6 text-stone-200 outline-none transition focus:border-stone-500"
                            value={detailVideoInput()}
                            onInput={(event) => setDetailVideoInput(event.currentTarget.value)}
                            placeholder={[
                              "sm9",
                              "https://www.nicovideo.jp/watch/so5364283",
                              "nm2829323",
                            ].join("\n")}
                          />
                        </div>
                      </Show>

                      <Show when={playlistShareInfo()}>
                        {(info) => (
                          <div class="space-y-2 rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3 text-sm text-stone-400">
                            <div class="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50"
                                onClick={handleCloseSharedUrl}
                              >
                                閉じる
                              </button>
                              <button
                                type="button"
                                class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
                                onClick={() => void handleCopySharedUrl()}
                                disabled={shareCopied() || !hasCurrentSharedUrl()}
                              >
                                {shareCopied() ? "コピー済み" : "コピー"}
                              </button>
                              <span>{info().formatLabel}</span>
                              <span>{info().byteCount} byte</span>
                            </div>
                            <a
                              href={hasCurrentSharedUrl() ? currentSharedUrl : undefined}
                              target="_blank"
                              rel="noreferrer"
                              class="break-all text-stone-200 underline decoration-stone-500 underline-offset-4 transition hover:text-white"
                            >
                              {info().displayUrl}
                            </a>
                          </div>
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
