import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

/** The tasks tab: the list. A task and the new-task form are sheets of the (app) stack, reachable from anywhere. */
export default function Layout() {
  return <Stack screenOptions={tabStackOptions} />;
}
