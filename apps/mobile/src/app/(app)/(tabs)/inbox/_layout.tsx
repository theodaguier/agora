import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

/** The inbox tab: the web sidebar's "Boîte de réception", with its large title. */
export default function Layout() {
  return <Stack screenOptions={tabStackOptions} />;
}
