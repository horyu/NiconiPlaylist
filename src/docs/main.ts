import { decodeIds } from "../lib/idCodec";
import { SAMPLE_SHARED_PLAYLIST_URL } from "../lib/playlistUrl";

type SharedPlaylistPreview =
  | {
      kind: "empty";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "ready";
      memo: string | null;
      title: string | null;
      videoIds: string[];
    };

function parseSharedPlaylistPreview(search: string): SharedPlaylistPreview {
  const params = new URLSearchParams(search);
  const encodedVideoIds = params.get("videoIds");

  if (!encodedVideoIds) {
    return { kind: "empty" };
  }

  try {
    return {
      kind: "ready",
      memo: params.get("memo"),
      title: params.get("title"),
      videoIds: decodeIds(encodedVideoIds),
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "videoIds を解析できませんでした。",
    };
  }
}

function createVideoIdListItems(videoIds: string[]): HTMLLIElement[] {
  return videoIds.map((videoId) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");

    link.href = `https://www.nicovideo.jp/watch/${encodeURIComponent(videoId)}`;
    link.textContent = videoId;
    listItem.append(link);

    return listItem;
  });
}

function splitVideoIds(videoIds: string[]): { firstHalf: string[]; secondHalf: string[] } {
  const middleIndex = Math.ceil(videoIds.length / 2);
  return {
    firstHalf: videoIds.slice(0, middleIndex),
    secondHalf: videoIds.slice(middleIndex),
  };
}

function requireElement<TElement extends Element>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);

  if (!element) {
    throw new Error(`${selector} not found.`);
  }

  return element;
}

function showState(preview: SharedPlaylistPreview): void {
  const emptyView = requireElement<HTMLElement>("#empty-view");
  const errorView = requireElement<HTMLElement>("#error-view");
  const readyView = requireElement<HTMLElement>("#ready-view");
  const sampleSharedUrlLink = requireElement<HTMLAnchorElement>("#sample-shared-url-link");

  sampleSharedUrlLink.href = SAMPLE_SHARED_PLAYLIST_URL;

  emptyView.hidden = preview.kind !== "empty";
  errorView.hidden = preview.kind !== "error";
  readyView.hidden = preview.kind !== "ready";

  if (preview.kind === "error") {
    requireElement<HTMLElement>("#error-message").textContent = preview.message;
    return;
  }

  if (preview.kind !== "ready") {
    return;
  }

  const title = preview.title?.trim() || "未指定";
  const memo = preview.memo?.trim() || "未指定";
  const { firstHalf, secondHalf } = splitVideoIds(preview.videoIds);
  const leftList = requireElement<HTMLOListElement>("#video-list-left");
  const rightList = requireElement<HTMLOListElement>("#video-list-right");

  requireElement<HTMLElement>("#meta-title").textContent = title;
  requireElement<HTMLElement>("#meta-memo").textContent = memo;
  requireElement<HTMLElement>("#video-count").textContent = String(preview.videoIds.length);

  leftList.replaceChildren(...createVideoIdListItems(firstHalf));
  rightList.replaceChildren(...createVideoIdListItems(secondHalf));
  rightList.hidden = secondHalf.length === 0;
  rightList.start = firstHalf.length + 1;
}

showState(parseSharedPlaylistPreview(location.search));
