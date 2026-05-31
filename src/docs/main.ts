import { decodeIds } from "../lib/idCodec";

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

function createVideoIdList(videoIds: string[]): string {
  return videoIds
    .map(
      (videoId) =>
        `<li><a href="https://www.nicovideo.jp/watch/${encodeURIComponent(videoId)}">${escapeHtml(videoId)}</a></li>`,
    )
    .join("");
}

function createSplitVideoIdLists(videoIds: string[]): string {
  const middleIndex = Math.ceil(videoIds.length / 2);
  const firstHalf = videoIds.slice(0, middleIndex);
  const secondHalf = videoIds.slice(middleIndex);

  return `
    <div class="video-id-columns">
      <ol>${createVideoIdList(firstHalf)}</ol>
      ${
        secondHalf.length > 0
          ? `<ol start="${middleIndex + 1}">${createVideoIdList(secondHalf)}</ol>`
          : ""
      }
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createAppHtml(preview: SharedPlaylistPreview): string {
  const body = (() => {
    switch (preview.kind) {
      case "empty":
        return `
          <p class="lead">
            このページは <a href="https://github.com/horyu/NiconiPlaylist">NiconiPlaylist</a>
            の案内用ページです。プレイリストの作成・インポート・再生は、ブラウザ拡張機能側から行ってください。
          </p>
        `;

      case "error":
        return `
          <div class="status error">共有URLの解析に失敗しました</div>
          <p class="lead">${escapeHtml(preview.message)}</p>
        `;

      case "ready": {
        const title = preview.title?.trim() || "未指定";
        const memo = preview.memo?.trim() || "未指定";

        return `
          <div class="status ready">共有URLを確認しました</div>
          <dl class="meta">
            <div>
              <dt>title</dt>
              <dd>${escapeHtml(title)}</dd>
            </div>
            <div>
              <dt>memo</dt>
              <dd>${escapeHtml(memo)}</dd>
            </div>
          </dl>
          <div class="section">
            <h2>videoId 一覧 (${preview.videoIds.length} 件)</h2>
            ${createSplitVideoIdLists(preview.videoIds)}
          </div>
          <p class="lead">
            この共有URLのインポートと再生は、
            <a href="https://github.com/horyu/NiconiPlaylist">NiconiPlaylist</a>
            のブラウザ拡張機能から行ってください。
          </p>
        `;
      }
    }
  })();

  return `
    <main>
      <p class="eyebrow">NiconiPlaylist</p>
      <h1>共有URLプレビュー</h1>
      ${body}
    </main>
  `;
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("#app not found.");
}

app.innerHTML = createAppHtml(parseSharedPlaylistPreview(location.search));
