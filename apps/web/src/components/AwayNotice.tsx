import { MoonIcon } from "@/components/icons";
import { defineMessages, useT } from "@/i18n";
import { availabilityLabel, useAvailability } from "@/lib/availability";

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
    <div className="flex flex-col gap-1 px-3 pb-2" aria-live="polite">
      {people.map((p) => (
        <AwayLine key={p.id} person={p} />
      ))}
    </div>
  );
}

function AwayLine({ person }: { person: { id: string; name: string } }) {
  const t = useT(messages);
  const label = availabilityLabel(useAvailability(person.id));
  if (!label) return null;
  return (
    <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
      <MoonIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{person.name.split(" ")[0]}</span> · {label}. {t.later}
      </span>
    </p>
  );
}
