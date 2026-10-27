import { Stack } from "expo-router";
import { tabStackOptions } from "@/lib/navigation";

export default function Layout() {
  return <Stack screenOptions={tabStackOptions} />;
}
