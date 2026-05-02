import { Show as SolidShow, type JSX } from "solid-js";

type PreviewPanelProps = {
  title: string;
  headerRight?: JSX.Element;
  children: JSX.Element;
};

export function PreviewPanel(props: PreviewPanelProps) {
  return (
    <section class="rounded-2xl border border-stone-800 bg-stone-950/60 p-4 lg:sticky lg:top-6">
      <div class="mb-3 flex items-center gap-3">
        <h3 class="text-sm font-medium text-stone-100">{props.title}</h3>
        <SolidShow when={props.headerRight} fallback={null}>
          <div class="flex items-center gap-3">{props.headerRight}</div>
        </SolidShow>
      </div>
      {props.children}
    </section>
  );
}
