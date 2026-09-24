/**
 * The mobile app's native icons, drawn from the house icons: the tab bar's (apps/mobile/assets/tab-icons)
 * and the header buttons' (apps/mobile/assets/header-icons).
 *
 * iOS's native tab bar and toolbar buttons only take images, not React components: each icon is
 * rendered to SVG from its definition here (the same paths as apps/mobile's), then rasterized at
 * @1x/@2x/@3x. iOS tints them itself (template rendering), so they are drawn in black.
 *
 * Run after changing one of these icons: `pnpm --filter @agora/web icons:tabs`.
 */
import { Resvg } from "@resvg/resvg-js";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatIntegrationIcon } from "../src/components/icons/integrations";
import { CheckIcon, ChevronLeftIcon, CloseIcon, InboxIcon, PlusIcon, RefreshIcon, SearchIcon, SlidersIcon, TaskListIcon, UserIcon, UserPlusIcon } from "../src/components/icons/ui";

type Icon = ComponentType<{ size?: number }>;

/** Each set: where it goes, its point size, and its icons by file name. */
const SETS: { dir: string; size: number; icons: Record<string, Icon> }[] = [
  {
    // The tab's file name (src/app/(app)/(tabs)/_layout.tsx) → its house icon.
    dir: "tab-icons",
    size: 26,
    icons: { chats: ChatIntegrationIcon, inbox: InboxIcon, tasks: TaskListIcon, profile: UserIcon, search: SearchIcon },
  },
  {
    // The header buttons (src/components/header-button.tsx `headerIcon`).
    dir: "header-icons",
    size: 22,
    icons: { check: CheckIcon, close: CloseIcon, plus: PlusIcon, refresh: RefreshIcon, sliders: SlidersIcon, "user-plus": UserPlusIcon, "chevron-left": ChevronLeftIcon },
  },
];

for (const { dir, size, icons } of SETS) {
  const out = new URL(`../../mobile/assets/${dir}/`, import.meta.url);
  for (const [name, Icon] of Object.entries(icons)) {
    let svg = renderToStaticMarkup(createElement(Icon, { size: 24 })).replaceAll("currentColor", "#000");
    if (!svg.includes("xmlns")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    for (const [scale, suffix] of [
      [1, ""],
      [2, "@2x"],
      [3, "@3x"],
    ] as const) {
      const png = new Resvg(svg, { fitTo: { mode: "width", value: size * scale }, background: "rgba(0,0,0,0)" }).render().asPng();
      await Bun.write(new URL(`${name}${suffix}.png`, out), png);
    }
    console.log(`${dir}: ${name}`);
  }
}
