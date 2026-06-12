import type { Playlist } from "@/lib/types";

export type PlaylistDraftVideoRow = {
  originalIndex: number | null;
  rowId: string;
  videoId: string;
};

export type PlaylistDraft = {
  memo: string;
  title: string;
  videoRows: PlaylistDraftVideoRow[];
};

export type VideoInsertPosition = "append" | "prepend" | "before-index" | "after-index";

export type PlaylistDraftUpdate = {
  deletedVideoIndices: number[];
  memo: string;
  title: string;
  videoIds: string[];
};

type RowIdFactory = () => string;

export function createPlaylistDraftVideoRows(
  videoIds: string[],
  createRowId: RowIdFactory = () => crypto.randomUUID(),
): PlaylistDraftVideoRow[] {
  return videoIds.map((videoId, originalIndex) => ({
    originalIndex,
    rowId: createRowId(),
    videoId,
  }));
}

export function createPlaylistDraft(
  playlist: Playlist,
  createRowId: RowIdFactory = () => crypto.randomUUID(),
): PlaylistDraft {
  return {
    memo: playlist.memo ?? "",
    title: playlist.title ?? "",
    videoRows: createPlaylistDraftVideoRows(playlist.videoIds, createRowId),
  };
}

export function insertPlaylistDraftVideos(
  draft: PlaylistDraft,
  videoIds: string[],
  position: VideoInsertPosition,
  indexInput: string,
  createRowId: RowIdFactory = () => crypto.randomUUID(),
): PlaylistDraft {
  const currentLength = draft.videoRows.length;
  const parsedIndex = Number.parseInt(indexInput.trim(), 10);
  const normalizedIndex = Number.isFinite(parsedIndex)
    ? Math.min(Math.max(parsedIndex, 1), Math.max(currentLength, 1))
    : currentLength;
  const insertAt = (() => {
    switch (position) {
      case "prepend":
        return 0;
      case "before-index":
        return normalizedIndex - 1;
      case "after-index":
        return normalizedIndex;
      case "append":
        return currentLength;
    }
  })();
  const safeInsertAt = Math.min(Math.max(insertAt, 0), currentLength);
  const nextRows = videoIds.map((videoId) => ({
    originalIndex: null,
    rowId: createRowId(),
    videoId,
  }));

  return {
    ...draft,
    videoRows: [
      ...draft.videoRows.slice(0, safeInsertAt),
      ...nextRows,
      ...draft.videoRows.slice(safeInsertAt),
    ],
  };
}

export function movePlaylistDraftVideo(
  draft: PlaylistDraft,
  rowId: string,
  direction: "up" | "down",
): PlaylistDraft {
  const currentIndex = draft.videoRows.findIndex((row) => row.rowId === rowId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= draft.videoRows.length) {
    return draft;
  }

  const nextRows = [...draft.videoRows];
  const [movedRow] = nextRows.splice(currentIndex, 1);
  nextRows.splice(targetIndex, 0, movedRow!);

  return { ...draft, videoRows: nextRows };
}

export function dropPlaylistDraftVideo(
  draft: PlaylistDraft,
  sourceRowId: string,
  targetRowId: string,
  placement: "before" | "after",
): PlaylistDraft {
  if (sourceRowId === targetRowId) {
    return draft;
  }

  const sourceIndex = draft.videoRows.findIndex((row) => row.rowId === sourceRowId);
  const targetIndex = draft.videoRows.findIndex((row) => row.rowId === targetRowId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return draft;
  }

  const nextRows = [...draft.videoRows];
  const [movedRow] = nextRows.splice(sourceIndex, 1);
  let insertIndex = placement === "before" ? targetIndex : targetIndex + 1;

  if (sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  nextRows.splice(insertIndex, 0, movedRow!);
  return { ...draft, videoRows: nextRows };
}

export function createPlaylistDraftUpdate(
  draft: PlaylistDraft,
  deletedRowIds: ReadonlySet<string>,
): PlaylistDraftUpdate {
  return {
    deletedVideoIndices: draft.videoRows
      .filter((row) => row.originalIndex !== null && deletedRowIds.has(row.rowId))
      .map((row) => row.originalIndex!)
      .toSorted((left, right) => left - right),
    memo: draft.memo,
    title: draft.title,
    videoIds: draft.videoRows
      .filter((row) => !deletedRowIds.has(row.rowId))
      .map((row) => row.videoId),
  };
}
