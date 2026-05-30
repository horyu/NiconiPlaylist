var M = ["sm", "so", "nm"],
  T = [
    ["so", "nm"],
    ["sm", "nm"],
    ["sm", "so"],
  ];
var D = ["sm", "so", "nm"];
function R(e, n) {
  if (!Number.isInteger(e) || e < -2147483647 || e > 2147483647) throw Error(`Invalid ${n}.`);
}
function N(e) {
  if (!Number.isInteger(e) || e < 0 || e > 2147483647) throw Error("Invalid ZigZag value.");
  return e % 2 === 0 ? e / 2 : -((e + 1) / 2);
}
function p(e, n) {
  let r = 0,
    t = 0,
    o = n;
  while (o < e.length) {
    let i = e[o];
    if (((r += (i & 127) * 2 ** t), (o += 1), (i & 128) === 0)) return { value: r, nextIndex: o };
    if (((t += 7), t > 28)) throw Error("Invalid varint value.");
  }
  throw Error("Incomplete varint.");
}
function k(e) {
  if (!/^[A-Za-z0-9\-_]*$/u.test(e)) throw Error("Invalid base64url.");
  if (e.length % 4 === 1) throw Error("Invalid base64url.");
  let n = (4 - (e.length % 4)) % 4,
    r = e.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat(n),
    t = "";
  try {
    t = atob(r);
  } catch {
    throw Error("Invalid base64url.");
  }
  let o = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1) o[i] = t.charCodeAt(i);
  return o;
}
function L(e, n, r) {
  let t = p(e, n),
    o = t.value,
    i = p(e, t.nextIndex),
    d = i.value,
    c = Array(d),
    s = i.nextIndex;
  for (let a = 0; a < d; a += 1) {
    let g = p(e, s);
    ((c[a] = g.value), (s = g.nextIndex));
  }
  let f = Math.ceil(d / 8),
    l = s + f;
  if (l > e.length) throw Error("Packed exception type bits are missing.");
  let u = e.slice(s, l);
  s = l;
  let m = p(e, s),
    E = m.value;
  s = m.nextIndex;
  let b = M[r],
    [v, _] = T[r],
    x = [];
  for (let a = 0; a < d; a += 1) {
    let g = c[a];
    for (let y = 0; y < g; y += 1) x.push(b);
    let A = (u[Math.floor(a / 8)] >> (a % 8)) & 1;
    x.push(A === 0 ? v : _);
  }
  for (let a = 0; a < E; a += 1) x.push(b);
  if (x.length !== o) throw Error("Decoded prefix count does not match count.");
  return { count: o, prefixes: x, nextIndex: s };
}
function S(e) {
  let n = 0n;
  for (let r of e) n = (n << 8n) | BigInt(r);
  return n;
}
function U(e, n) {
  let r = p(e, n),
    t = r.value,
    o = p(e, r.nextIndex),
    i = o.value,
    d = o.nextIndex,
    c = d + i;
  if (c > e.length) throw Error("Packed base-3 prefix bytes are missing.");
  let s = S(e.slice(d, c)),
    f = Array(t);
  for (let l = t - 1; l >= 0; l -= 1) {
    let u = Number(s % 3n),
      m = D[u];
    if (!m) throw Error("Decoded base-3 prefix is invalid.");
    ((f[l] = m), (s /= 3n));
  }
  if (s !== 0n) throw Error("Decoded prefix count does not match count.");
  return { count: t, prefixes: f, nextIndex: c };
}
function I(e) {
  let n = k(e),
    r = n[0];
  if (r === void 0 || r > 3) throw Error("Invalid mode.");
  let t = r,
    o = t === 3 ? U(n, 1) : L(n, 1, t),
    i = [],
    d = 0,
    c = o.nextIndex;
  for (let s of o.prefixes) {
    let f = p(n, c);
    c = f.nextIndex;
    let l = N(f.value);
    R(l, "delta");
    let u = d + l;
    if (!Number.isSafeInteger(u) || u < 1 || u > 999999999)
      throw Error("Decoded numeric part is out of range.");
    ((d = u), i.push(`${s}${u}`));
  }
  if (i.length !== o.count) throw Error("Decoded prefix count does not match count.");
  if (c !== n.length) throw Error("Unexpected trailing bytes.");
  return i;
}
function B(e) {
  let n = new URLSearchParams(e),
    r = n.get("videoIds");
  if (!r) return { kind: "empty" };
  try {
    return { kind: "ready", memo: n.get("memo"), title: n.get("title"), videoIds: I(r) };
  } catch (t) {
    return {
      kind: "error",
      message: t instanceof Error ? t.message : "videoIds を解析できませんでした。",
    };
  }
}
function w(e) {
  return e
    .map(
      (n) =>
        `<li><a href="https://www.nicovideo.jp/watch/${encodeURIComponent(n)}">${h(n)}</a></li>`,
    )
    .join("");
}
function $(e) {
  let n = Math.ceil(e.length / 2),
    r = e.slice(0, n),
    t = e.slice(n);
  return `
    <div class="video-id-columns">
      <ol>${w(r)}</ol>
      ${t.length > 0 ? `<ol start="${n + 1}">${w(t)}</ol>` : ""}
    </div>
  `;
}
function h(e) {
  return e
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function X(e) {
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
          <p class="lead">${h(e.message)}</p>
        `;
          case "ready": {
            let r = e.title?.trim() || "未指定",
              t = e.memo?.trim() || "未指定";
            return `
          <div class="status ready">共有URLを確認しました</div>
          <dl class="meta">
            <div>
              <dt>title</dt>
              <dd>${h(r)}</dd>
            </div>
            <div>
              <dt>memo</dt>
              <dd>${h(t)}</dd>
            </div>
          </dl>
          <div class="section">
            <h2>videoId 一覧 (${e.videoIds.length} 件)</h2>
            ${$(e.videoIds)}
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
var P = document.querySelector("#app");
if (!P) throw Error("#app not found.");
P.innerHTML = X(B(location.search));
