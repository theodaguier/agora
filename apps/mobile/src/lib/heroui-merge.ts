import { twMergeConfig } from "heroui-native/utils";
import { IOS_TEXT_SIZES } from "@/lib/utils";

/*
 * HeroUI merges a component's classes with ours through its own tailwind-merge, which doesn't know the
 * iOS text styles of global.css: it read `text-footnote` as a colour, so `text-footnote text-muted` kept
 * the colour and dropped the size (a table header, a subtitle, a caption came out at the default size).
 * Its config is one shared object, read lazily by `cn` and copied by each component's `tv` when its module
 * loads: hence edited in place (`cn` holds this very object), from the app's entry (index.ts), before
 * expo-router loads any route and, with them, HeroUI's components.
 */
const groups = (twMergeConfig.classGroups ??= {}) as Record<string, unknown>;
groups["font-size"] = [{ text: IOS_TEXT_SIZES }];
