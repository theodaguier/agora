import { WorkingOn as PersonWorkingOn } from "@/components/people/working-on";
import { useMe } from "@/components/server-scope";

/* apps/web/src/components/WorkingOn.tsx, for your own tasks screen: the profiles' component, on you. */

/** The task you're working on right now, with "Stop"; a tap opens it. Nothing when nothing is in progress. */
export function WorkingOn() {
  const me = useMe();
  return <PersonWorkingOn userId={me.id} openable quiet />;
}
