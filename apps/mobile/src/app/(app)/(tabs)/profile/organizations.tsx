import { Stack } from "expo-router";
import { ScrollView } from "react-native";
import { Organizations } from "@/components/profile/organizations";
import { organizationsMessages } from "@/components/profile/organizations-messages";

/** The organizations this phone is signed in to (was the `servers` sheet). */
export default function OrganizationsScreen() {
  return (
    <>
      <Stack.Screen.Title>{organizationsMessages.organizations}</Stack.Screen.Title>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="px-4 pb-12 pt-4">
        <Organizations />
      </ScrollView>
    </>
  );
}
