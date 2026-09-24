import type { DraftView } from "@agora/core";

export function draftLabel(view: DraftView) {
  switch (view.type) {
    case "mail":
      return view.draft.subject || view.draft.to.join(", ");
    case "calendar":
    case "tasks":
      return view.draft.title;
    case "chat":
      return view.draft.channel;
  }
}
