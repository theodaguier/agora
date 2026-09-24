import type { NativeStackNavigationOptions } from "expo-router";

/*
 * How screens are presented, in one place. The rules:
 * - a tab's stack holds its list and what you drill into from it (pushed);
 * - screens reached from anywhere (a conversation, a task, a bot, a colleague) live in the (app)
 *   stack above the tabs, so opening one never switches tab and "back" returns where you were;
 * - a form sheet is for one short job (create, pick, edit a value). It never opens another sheet
 *   nor pushes a screen inside itself: it closes first. Its presentation is set in the layout,
 *   never by the screen.
 */

/** A tab's stack: compact titles only (no large title anywhere), header over the content, iOS 26 style. */
export const tabStackOptions: NativeStackNavigationOptions = {
  headerLargeTitle: false,
  headerTransparent: true,
  headerBlurEffect: "none",
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: "minimal",
};

/**
 * A native form sheet with its grabber; `detents` as fractions of the screen height.
 * The header floats over the content (transparent): with an opaque one the sheet lays its content out
 * at the full sheet height under the header, so the bottom was cut and could not be scrolled to.
 * Each sheet's root ScrollView therefore takes `contentInsetAdjustmentBehavior="automatic"`.
 */
export const sheetOptions = (detents: number[] = [1]): NativeStackNavigationOptions => ({
  presentation: "formSheet",
  sheetGrabberVisible: true,
  sheetAllowedDetents: detents,
  headerShown: true,
  headerLargeTitle: false,
  headerTransparent: true,
});
