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
    <style>
      :root {
        color-scheme: dark;
        font-family: system-ui, sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(20, 184, 166, 0.14), transparent 32%),
          #14110f;
        color: #f5f5f4;
      }

      #app {
        padding: 40px 16px;
      }

      main {
        width: min(720px, 100%);
        margin: 0 auto;
        border: 1px solid #44403c;
        border-radius: 28px;
        padding: 32px;
        background: rgba(28, 25, 23, 0.94);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
      }

      .eyebrow {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #a8a29e;
      }

      h1 {
        margin: 0 0 16px;
        font-size: 30px;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 16px;
      }

      .lead,
      .note,
      dd,
      li {
        line-height: 1.8;
        color: #d6d3d1;
      }

      .status {
        display: inline-flex;
        align-items: center;
        margin-bottom: 16px;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
      }

      .status.ready {
        border: 1px solid rgba(16, 185, 129, 0.38);
        background: rgba(16, 185, 129, 0.12);
        color: #a7f3d0;
      }

      .status.error {
        border: 1px solid rgba(248, 113, 113, 0.4);
        background: rgba(248, 113, 113, 0.12);
        color: #fecaca;
      }

      .meta {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
        margin: 0 0 24px;
      }

      .meta div,
      .section {
        border: 1px solid #3f3f46;
        border-radius: 20px;
        background: rgba(12, 10, 9, 0.42);
        padding: 16px;
      }

      dt {
        margin: 0 0 6px;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #a8a29e;
      }

      dd {
        margin: 0;
        word-break: break-word;
      }

      ol {
        margin: 0;
        padding-left: 20px;
      }

      .video-id-columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 24px;
      }

      .video-id-columns ol {
        min-width: 0;
      }

      @media (max-width: 720px) {
        .video-id-columns {
          grid-template-columns: minmax(0, 1fr);
          gap: 12px;
        }
      }

      a {
        color: #99f6e4;
      }
    </style>
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
