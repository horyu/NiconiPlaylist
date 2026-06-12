import { createEffect, createMemo, createSignal, type Accessor } from "solid-js";

import { updateStoredPlaylist } from "@/background/services/playlistStore";
import { enqueueVideoMetadataForVideoIds } from "@/background/services/videoMetadata";
import { normalizeOptionalText } from "@/lib/text";
import type { Playlist, PlaylistId } from "@/lib/types";
import { parseVideoIdInputLines } from "@/lib/videoIdInput";
import {
  createPlaylistDraft,
  createPlaylistDraftUpdate,
  createPlaylistDraftVideoRows,
  dropPlaylistDraftVideo,
  insertPlaylistDraftVideos,
  movePlaylistDraftVideo,
  type PlaylistDraft,
  type PlaylistDraftVideoRow,
  type VideoInsertPosition,
} from "@/options/playlistDraft";
import type { OptionsToast } from "@/options/toast";

type UsePlaylistDetailEditorOptions = {
  createFallbackTitle: () => string;
  onFeedback: (toast: OptionsToast | null) => void;
  onUpdated: () => Promise<void> | void;
  selectedPlaylist: Accessor<Playlist | null>;
};

const EMPTY_DRAFT: PlaylistDraft = {
  memo: "",
  title: "",
  videoRows: [],
};

export function usePlaylistDetailEditor(options: UsePlaylistDetailEditorOptions) {
  const [isEditingDetail, setIsEditingDetail] = createSignal(false);
  const [detailVideoInput, setDetailVideoInput] = createSignal("");
  const [detailVideoInsertPosition, setDetailVideoInsertPosition] =
    createSignal<VideoInsertPosition>("append");
  const [detailVideoInsertIndexInput, setDetailVideoInsertIndexInput] = createSignal("1");
  const [detailReadonlyVideoRows, setDetailReadonlyVideoRows] = createSignal<
    PlaylistDraftVideoRow[]
  >([]);
  const [detailReadonlyVideoRowsKey, setDetailReadonlyVideoRowsKey] = createSignal("");
  const [detailDraft, setDetailDraft] = createSignal<PlaylistDraft>(EMPTY_DRAFT);
  const [deletedDraftVideoCount, setDeletedDraftVideoCount] = createSignal(0);
  const [hasDraftVideoChanges, setHasDraftVideoChanges] = createSignal(false);
  const [detailDraftResetKey, setDetailDraftResetKey] = createSignal(0);
  const [detailDraftPlaylistId, setDetailDraftPlaylistId] = createSignal<PlaylistId | null>(null);
  let deletedDraftVideoRowIds = new Set<string>();

  function resetEditor(playlist: Playlist, editing: boolean): void {
    setDetailDraft(createPlaylistDraft(playlist));
    deletedDraftVideoRowIds = new Set<string>();
    setDeletedDraftVideoCount(0);
    setHasDraftVideoChanges(false);
    setDetailVideoInput("");
    setDetailVideoInsertPosition("append");
    setDetailVideoInsertIndexInput("1");
    setDetailDraftResetKey((currentKey) => currentKey + 1);
    setDetailDraftPlaylistId(playlist.id);
    setIsEditingDetail(editing);
  }

  createEffect(() => {
    const playlist = options.selectedPlaylist();

    if (!playlist || detailDraftPlaylistId() === playlist.id) {
      return;
    }

    resetEditor(playlist, false);
  });

  createEffect(() => {
    const playlist = options.selectedPlaylist();

    if (!playlist) {
      setDetailReadonlyVideoRows([]);
      setDetailReadonlyVideoRowsKey("");
      return;
    }

    const nextKey = `${playlist.id}:${playlist.videoIds.join("\u0000")}`;

    if (detailReadonlyVideoRowsKey() === nextKey) {
      return;
    }

    setDetailReadonlyVideoRows(createPlaylistDraftVideoRows(playlist.videoIds));
    setDetailReadonlyVideoRowsKey(nextKey);
  });

  createEffect(() => {
    if (!isEditingDetail()) {
      return;
    }

    const videoIds = detailDraft().videoRows.map((row) => row.videoId);

    if (videoIds.length > 0) {
      enqueueVideoMetadataForVideoIds(videoIds);
    }
  });

  const hasDetailUnsavedChanges = createMemo(() => {
    const playlist = options.selectedPlaylist();

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

  function startEditing(): void {
    const playlist = options.selectedPlaylist();

    if (playlist) {
      resetEditor(playlist, true);
      options.onFeedback(null);
    }
  }

  function cancelEditing(): void {
    const playlist = options.selectedPlaylist();

    if (playlist) {
      resetEditor(playlist, false);
      options.onFeedback(null);
    }
  }

  async function save(): Promise<void> {
    const playlist = options.selectedPlaylist();

    if (!playlist) {
      return;
    }

    options.onFeedback(null);

    try {
      const update = createPlaylistDraftUpdate(detailDraft(), deletedDraftVideoRowIds);
      await updateStoredPlaylist(
        playlist.id,
        {
          memo: normalizeOptionalText(update.memo),
          title: normalizeOptionalText(update.title) ?? options.createFallbackTitle(),
          videoIds: update.videoIds,
        },
        { deletedVideoIndices: update.deletedVideoIndices },
      );
      resetEditor(playlist, false);
      options.onFeedback({ text: "プレイリストを更新しました。", tone: "success" });
      await options.onUpdated();
    } catch (error) {
      options.onFeedback({
        text: error instanceof Error ? error.message : "プレイリストの更新に失敗しました。",
        tone: "error",
      });
    }
  }

  function setVideoDeleted(rowId: string, isDeleted: boolean): void {
    const hasRowId = deletedDraftVideoRowIds.has(rowId);

    if (isDeleted === hasRowId) {
      return;
    }

    if (isDeleted) {
      deletedDraftVideoRowIds.add(rowId);
      setDeletedDraftVideoCount((currentCount) => currentCount + 1);
    } else {
      deletedDraftVideoRowIds.delete(rowId);
      setDeletedDraftVideoCount((currentCount) => currentCount - 1);
    }
    setHasDraftVideoChanges(true);
  }

  function appendVideos(): void {
    const value = detailVideoInput().trim();

    if (!value) {
      options.onFeedback({
        text: "watch URL または動画IDを入力してください。",
        tone: "error",
      });
      return;
    }

    try {
      const videoIds = parseVideoIdInputLines(value);
      setDetailDraft((draft) =>
        insertPlaylistDraftVideos(
          draft,
          videoIds,
          detailVideoInsertPosition(),
          detailVideoInsertIndexInput(),
        ),
      );
      setHasDraftVideoChanges(true);
      setDetailVideoInput("");
      options.onFeedback(null);
    } catch (error) {
      options.onFeedback({
        text:
          error instanceof Error
            ? error.message
            : "watch URL または動画IDの入力を解析できませんでした。",
        tone: "error",
      });
    }
  }

  function moveVideo(rowId: string, direction: "up" | "down"): void {
    setDetailDraft((draft) => movePlaylistDraftVideo(draft, rowId, direction));
    setHasDraftVideoChanges(true);
    options.onFeedback(null);
  }

  function dropVideo(
    sourceRowId: string,
    targetRowId: string,
    placement: "before" | "after",
  ): void {
    if (sourceRowId === targetRowId) {
      return;
    }

    setDetailDraft((draft) => dropPlaylistDraftVideo(draft, sourceRowId, targetRowId, placement));
    setHasDraftVideoChanges(true);
    options.onFeedback(null);
  }

  return {
    appendVideos,
    cancelEditing,
    detailDraft,
    detailDraftResetKey,
    detailReadonlyVideoRows,
    detailVideoInput,
    detailVideoInsertIndexInput,
    detailVideoInsertPosition,
    dropVideo,
    hasDetailUnsavedChanges,
    isEditingDetail,
    moveVideo,
    save,
    setDetailDraft,
    setDetailVideoInput,
    setDetailVideoInsertIndexInput,
    setDetailVideoInsertPosition,
    setVideoDeleted,
    startEditing,
  };
}
