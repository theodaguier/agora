/*
 * The app's entry: HeroUI's class merging learns the iOS text styles first (lib/heroui-merge.ts), before
 * expo-router loads the routes and, with them, HeroUI's components, which build their styles on load.
 */
import "@/lib/heroui-merge";
import "expo-router/entry";
