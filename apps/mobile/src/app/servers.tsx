import { Redirect, type Href } from "expo-router";

/** The organizations moved to the Profile tab; an old link lands there. */
export default function Servers() {
  return <Redirect href={"/profile/organizations" as Href} />;
}
