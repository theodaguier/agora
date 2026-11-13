import { Typography } from "heroui-native";
import { View } from "react-native";
import { MoonIcon } from "@/components/icons";
import { availabilityLabel, useAvailability } from "@/lib/availability";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/AwayNotice.tsx */

const messages = defineMessages({
  en: { later: "They'll see your message when they're back." },
  fr: { later: "Ton message l'attendra à son retour." },
});

/**
 * Above the composer: the colleagues this message is for (the other person of a
 * direct conversation, the ones mentioned) who are absent, in "do not disturb"
 * or outside their working hours.
 */
export function AwayNotice({ people }: { people: { id: string; name: string }[] }) {
  if (!people.length) return null;
  return (
    <View className="gap-1 px-1" accessibilityLiveRegion="polite">
      {people.map((p) => (
        <AwayAlert key={p.id} person={p} />
      ))}
    </View>
  );
}

/**
 * One grey line per colleague, as the web's (no box over the composer): the moon, their first name,
 * why in brackets, then that the message waits. Whether they're away is read per person (a hook).
 */
function AwayAlert({ person }: { person: { id: string; name: string } }) {
  const t = messages;
  const label = availabilityLabel(useAvailability(person.id));
  if (!label) return null;
  return (
    <View className="flex-row items-start gap-2">
      <MoonIcon size={16} className="mt-0.5 text-muted" />
      <Typography type="body-sm" color="muted" className="flex-1">
        <Typography type="body-sm" weight="medium">
          {person.name.split(" ")[0]}
        </Typography>{" "}
        ({label}). {t.later}
      </Typography>
    </View>
  );
}
