var v = ["sm", "so", "nm", "ss"];
function E(e, r) {
  if (!Number.isInteger(e) || e < -2147483647 || e > 2147483647) throw Error(`Invalid ${r}.`);
}
function _(e) {
  if (!Number.isInteger(e) || e < 0 || e > 2147483647) throw Error("Invalid ZigZag value.");
  return e % 2 === 0 ? e / 2 : -((e + 1) / 2);
}
function h(e, r) {
  let n = 0,
    t = 0,
    o = r;
  while (o < e.length) {
    let i = e[o];
    if (((n += (i & 127) * 2 ** t), (o += 1), (i & 128) === 0)) return { value: n, nextIndex: o };
    if (((t += 7), t > 28)) throw Error("Invalid varint value.");
  }
  throw Error("Incomplete varint.");
}
function A(e) {
  if (!/^[A-Za-z0-9\-_]*$/u.test(e)) throw Error("Invalid base64url.");
  if (e.length % 4 === 1) throw Error("Invalid base64url.");
  let r = (4 - (e.length % 4)) % 4,
    n = e.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(r),
    t = "";
  try {
    t = atob(n);
  } catch {
    throw Error("Invalid base64url.");
  }
  let o = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1) o[i] = t.charCodeAt(i);
  return o;
}
function x(e) {
  let r = A(e),
    n = h(r, 0),
    t = n.value,
    o = Math.ceil(t / 4),
    i = n.nextIndex,
    l = i + o;
  if (l > r.length) throw Error("Packed prefix bytes are missing.");
  let I = r.slice(i, l),
    p = [],
    m = 0,
    c = l;
  for (let a = 0; a < t; a += 1) {
    let w = (I[Math.floor(a / 4)] >> ((a % 4) * 2)) & 3,
      u = v[w];
    if (!u) throw Error("Invalid prefix code.");
    let g = h(r, c);
    c = g.nextIndex;
    let f = _(g.value);
    E(f, "delta");
    let s = m + f;
    if (!Number.isSafeInteger(s) || s < 1 || s > 999999999)
      throw Error("Decoded numeric part is out of range.");
    ((m = s), p.push(`${u}${s}`));
  }
  if (c !== r.length) throw Error("Unexpected trailing bytes.");
  return p;
}
function N(e) {
  let r = new URLSearchParams(e),
    n = r.get("videoIds");
  if (!n) return { kind: "empty" };
  try {
    return { kind: "ready", memo: r.get("memo"), title: r.get("title"), videoIds: x(n) };
  } catch (t) {
    return {
      kind: "error",
      message: t instanceof Error ? t.message : "videoIds を解析できませんでした。",
    };
  }
}
function b(e) {
  return e
    .map(
      (r) =>
        `<li><a href="https://www.nicovideo.jp/watch/${encodeURIComponent(r)}">${d(r)}</a></li>`,
    )
    .join("");
}
function P(e) {
  let r = Math.ceil(e.length / 2),
    n = e.slice(0, r),
    t = e.slice(r);
  return `
    <div class="video-id-columns">
      <ol>${b(n)}</ol>
      ${t.length > 0 ? `<ol start="${r + 1}">${b(t)}</ol>` : ""}
    </div>
  `;
}
function d(e) {
  return e
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function k(e) {
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
      ${(() => {
        switch (e.kind) {
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
          <p class="lead">${d(e.message)}</p>
        `;
          case "ready": {
            let n = e.title?.trim() || "未指定",
              t = e.memo?.trim() || "未指定";
            return `
          <div class="status ready">共有URLを確認しました</div>
          <dl class="meta">
            <div>
              <dt>title</dt>
              <dd>${d(n)}</dd>
            </div>
            <div>
              <dt>memo</dt>
              <dd>${d(t)}</dd>
            </div>
          </dl>
          <div class="section">
            <h2>videoId 一覧 (${e.videoIds.length} 件)</h2>
            ${P(e.videoIds)}
          </div>
          <p class="lead">
            この共有URLのインポートと再生は、
            <a href="https://github.com/horyu/NiconiPlaylist">NiconiPlaylist</a>
            のブラウザ拡張機能から行ってください。
          </p>
        `;
          }
        }
      })()}
    </main>
  `;
}
var y = document.querySelector("#app");
if (!y) throw Error("#app not found.");
y.innerHTML = k(N(location.search));
