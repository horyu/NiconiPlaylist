import { For, Show } from "solid-js";

type PlaylistActionMenuProps = {
  buttonLabel: string;
  disabled?: boolean;
  open: boolean;
  options: readonly { label: string; value: string }[];
  onSelect: (value: string) => void;
  onToggle: () => void;
};

export function PlaylistActionMenu(props: PlaylistActionMenuProps) {
  return (
    <div class="relative">
      <button
        type="button"
        class="rounded-full border border-stone-600 px-3 py-1.5 text-xs font-medium text-stone-200 transition hover:border-stone-500 hover:bg-stone-800 disabled:cursor-not-allowed disabled:border-stone-800 disabled:text-stone-600"
        onClick={() => props.onToggle()}
        disabled={props.disabled}
      >
        {props.buttonLabel}
      </button>
      <Show when={props.open}>
        <div class="absolute left-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-700 bg-stone-950 shadow-lg shadow-black/30">
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                onClick={() => props.onSelect(option.value)}
                class="block w-full px-3 py-2 text-left text-sm text-stone-200 transition hover:bg-stone-900"
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
