import { Alert } from "heroui-native";
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
    <View className="gap-2" accessibilityLiveRegion="polite">
      {people.map((p) => (
        <AwayAlert key={p.id} person={p} />
      ))}
    </View>
  );
}

/** One alert per colleague: whether they're away is read per person (a hook), so each one decides to show. */
function AwayAlert({ person }: { person: { id: string; name: string } }) {
  const t = messages;
  const label = availabilityLabel(useAvailability(person.id));
  if (!label) return null;
  return (
    <Alert className="items-center">
      <Alert.Indicator>
        <MoonIcon className="size-[18px] text-muted" />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>
          {person.name.split(" ")[0]} · {label}
        </Alert.Title>
        <Alert.Description>{t.later}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
