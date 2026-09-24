import { renderEvent, type ConversationEvent } from "@agora/core";
import { useLocale } from ".";

/** Text of a system message in the interface language; older events only have their stored text. */
export function useEventText() {
  const locale = useLocale();
  return (text: string, event?: ConversationEvent | null) => (event ? renderEvent(event, locale) : text);
}
