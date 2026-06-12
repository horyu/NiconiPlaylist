type PlaylistShareUrlPanelProps = {
  byteCount: number;
  copied: boolean;
  displayUrl: string;
  formatLabel: string;
  url: string | undefined;
  onClose: () => void;
  onCopy: () => void;
};

export function PlaylistShareUrlPanel(props: PlaylistShareUrlPanelProps) {
  return (
    <div class="space-y-2 rounded-2xl border border-stone-800 bg-stone-900/50 px-4 py-3 text-sm text-stone-400">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50"
          onClick={() => props.onClose()}
        >
          閉じる
        </button>
        <button
          type="button"
          class="rounded-full border border-stone-700 px-3 py-1 text-xs font-medium text-stone-200 transition hover:border-stone-400 hover:text-stone-50 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
          onClick={() => props.onCopy()}
          disabled={props.copied || props.url === undefined}
        >
          {props.copied ? "コピー済み" : "コピー"}
        </button>
        <span>{props.formatLabel}</span>
        <span>{props.byteCount} byte</span>
      </div>
      <a
        href={props.url}
        target="_blank"
        rel="noreferrer"
        class="break-all text-stone-200 underline decoration-stone-500 underline-offset-4 transition hover:text-white"
      >
        {props.displayUrl}
      </a>
    </div>
  );
}
