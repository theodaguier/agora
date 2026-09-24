import { useSyncExternalStore } from "react";
import { defineMessages, type Messages } from "@/i18n";

/**
 * "What's new" dialog content. Add a release at the top of `RELEASES` when a version
 * brings something worth showing: every account sees it once, at its next visit
 * (accounts created after `date` skip it).
 */
export type Release = {
  version: string;
  /** Day of the release, YYYY-MM-DD. */
  date: string;
  summary: Messages<string>;
  /** Shown under the summary by "Learn more", one line per change. */
  details: Messages<string[]>;
  tags: ("feature" | "bugfix" | "refactor" | "migration")[];
  author: string;
  /** Cover image served from `public/` (e.g. `/whats-new/0.3.0.webp`), 16:9. Without it, a gradient with the version number. */
  cover?: string;
};

export const RELEASES: Release[] = [
  {
    version: "0.2.0",
    date: "2026-09-23",
    summary: defineMessages({
      en: "Member profiles and email invitations, token usage and cost per bot and model in Settings, and the browser a bot drives now shown live in the side panel.",
      fr: "Profils des membres et invitations par email, consommation de tokens et coût par bot et par modèle dans les Paramètres, et le navigateur piloté par un bot affiché en direct dans le panneau latéral.",
    }),
    details: defineMessages({
      en: [
        "Profiles: first name, last name and role are required; username, bio and photo are optional. Edit yours in Settings › General.",
        "Invitations: admins invite by email; the invitee completes their profile and chooses their password from the link (valid 7 days). Pending invitations can be resent or cancelled.",
        "Token usage in Settings › Usage: tokens and estimated cost from 24 hours to 12 months, by member, bot, task and model. Members see their own usage, admins the whole organization.",
        "Agent screen: when a bot drives a browser, the side panel shows it live. Click the picture to enlarge it.",
      ],
      fr: [
        "Profils : prénom, nom et rôle, plus un username, une bio et une photo si on le souhaite. Chacun modifie le sien dans Paramètres › Général.",
        "Invitations : l'admin invite par email ; la personne complète son profil et choisit son mot de passe depuis le lien (valable 7 jours). Les invitations en attente peuvent être renvoyées ou annulées.",
        "Consommation dans Paramètres › Consommation : tokens et coût estimé de 24 h à 12 mois, par membre, bot, tâche et modèle. Un membre voit sa propre consommation, un admin toute l'organisation.",
        "Écran de l'agent : quand un bot pilote un navigateur, le panneau latéral l'affiche en direct. Cliquez sur l'image pour l'agrandir.",
      ],
    }),
    tags: ["feature", "migration"],
    author: "theodaguier",
  },
];

export const latestRelease = RELEASES[0];

/** Whether the dialog is open. Opened automatically once per release, or from the user menu. */
let open = false;
const listeners = new Set<() => void>();

export function setWhatsNewOpen(value: boolean) {
  open = value;
  listeners.forEach((l) => l());
}

/** Live value, for an effect that runs in the same commit as the one opening it. */
export const isWhatsNewOpen = () => open;

export function useWhatsNewOpen() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
