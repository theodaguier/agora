import type { IntegrationType } from "@agora/core";
import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/admin/AppIntegrations.tsx: the third-party services the app itself uses. */

/** One of the app's own integrations; secret values come redacted (apps/web/src/lib/api.ts AppIntegration). */
export type AppIntegration = {
  id: "resend" | "logodev" | "googlemaps" | "github";
  source: "app" | "env" | null;
  values: Record<string, string>;
};

export type IntegrationId = AppIntegration["id"];
export type FieldSpec = { name: string; secret?: boolean; placeholder: string };

/** Each integration: its brand, its fields, where to get them. */
export const SPECS: Record<IntegrationId, { name: string; domain: string; type: IntegrationType; docs: string; fields: FieldSpec[] }> = {
  resend: {
    name: "Resend",
    domain: "resend.com",
    type: "mail",
    docs: "https://resend.com/api-keys",
    fields: [
      { name: "apiKey", secret: true, placeholder: "re_…" },
      { name: "from", placeholder: "Agora <no-reply@example.com>" },
    ],
  },
  logodev: {
    name: "logo.dev",
    domain: "logo.dev",
    type: "other",
    docs: "https://www.logo.dev/dashboard/api-keys",
    fields: [{ name: "publishableKey", placeholder: "pk_…" }],
  },
  googlemaps: {
    name: "Google Maps",
    domain: "google.com",
    type: "other",
    docs: "https://console.cloud.google.com/google/maps-apis/credentials",
    fields: [{ name: "mapsKey", secret: true, placeholder: "AIza…" }],
  },
  github: {
    name: "GitHub",
    domain: "github.com",
    type: "code",
    docs: "https://github.com/settings/personal-access-tokens/new",
    fields: [{ name: "token", secret: true, placeholder: "github_pat_…" }],
  },
};

export const integrationsMessages = defineMessages({
  en: {
    title: "Integrations",
    intro: "Services Agora itself runs on. Your agents' connectors are set in each agent.",
    purpose: {
      resend: "Sends invitation and password reset emails.",
      logodev: "Shows brand logos in conversations and connectors.",
      googlemaps: "Draws the maps of the places agents show.",
      github: "The repositories of projects and code sessions: clones, branches, pull requests.",
    } as Record<IntegrationId, string>,
    fields: {
      apiKey: "API key",
      from: "Sender",
      publishableKey: "Publishable key",
      mapsKey: "API key",
      token: "Access token",
    } as Record<string, string>,
    help: {
      apiKey: "A “Sending access” key is enough.",
      from: "Its domain must be verified in Resend.",
      publishableKey: "The pk_… key: it's made to be read by the browser.",
      mapsKey: "With the Maps Static API enabled. It stays on the server.",
      token: "A fine-grained token with Contents, Pull requests, Issues and Commit statuses, on the repositories Agora may use.",
    } as Record<string, string>,
    connected: "Connected",
    fromEnv: "From the environment",
    connect: "Connect",
    edit: "Edit",
    disconnect: "Disconnect",
    disconnectTitle: (name: string) => `Disconnect ${name}?`,
    disconnectText: {
      resend: "Invitation links will only be shown to the admin, and password reset emails won't be sent anymore.",
      logodev: "Conversations and connectors show generic icons again.",
      googlemaps: "Maps of places fall back to a plain base map.",
      github: "Projects and code sessions won't reach your repositories anymore.",
    } as Record<IntegrationId, string>,
    envNote: "The server's environment variables will apply again, if any.",
    dialogTitle: (name: string) => `Connect ${name}`,
    dialogText: "Checked with the service before being saved. Secret keys are stored encrypted.",
    getKey: (name: string) => `Get a key on ${name}`,
    keep: (preview: string) => `Leave empty to keep ${preview}.`,
    show: "Show",
    hide: "Hide",
    checking: "Checking…",
    connectedTo: (name: string) => `${name} connected.`,
    disconnected: (name: string) => `${name} disconnected.`,
  },
  fr: {
    title: "Intégrations",
    intro: "Services sur lesquels Agora s'appuie pour fonctionner. Les connecteurs de tes agents se règlent dans chaque agent.",
    purpose: {
      resend: "Envoie les emails d'invitation et de réinitialisation du mot de passe.",
      logodev: "Affiche le logo des marques dans les conversations et les connecteurs.",
      googlemaps: "Dessine la carte des lieux que montrent les agents.",
      github: "Les dépôts des projets et des sessions de code : clones, branches, pull requests.",
    },
    fields: {
      apiKey: "Clé API",
      from: "Expéditeur",
      publishableKey: "Clé publique",
      mapsKey: "Clé API",
      token: "Jeton d'accès",
    },
    help: {
      apiKey: "Une clé « Sending access » suffit.",
      from: "Son domaine doit être vérifié dans Resend.",
      publishableKey: "La clé pk_… : elle est faite pour être lue par le navigateur.",
      mapsKey: "Avec l'API Maps Static activée. Elle reste sur le serveur.",
      token: "Un jeton fine-grained avec Contents, Pull requests, Issues et Commit statuses, sur les dépôts qu'Agora peut utiliser.",
    },
    connected: "Connecté",
    fromEnv: "Via l'environnement",
    connect: "Connecter",
    edit: "Modifier",
    disconnect: "Déconnecter",
    disconnectTitle: (name: string) => `Déconnecter ${name} ?`,
    disconnectText: {
      resend: "Les liens d'invitation ne seront plus qu'affichés à l'admin, et les emails de réinitialisation du mot de passe ne partiront plus.",
      logodev: "Les conversations et les connecteurs retrouvent des icônes génériques.",
      googlemaps: "Les cartes des lieux reviennent à un fond de carte simple.",
      github: "Les projets et les sessions de code n'accéderont plus à tes dépôts.",
    },
    envNote: "Les variables d'environnement du serveur s'appliqueront de nouveau, s'il y en a.",
    dialogTitle: (name: string) => `Connecter ${name}`,
    dialogText: "Vérifiée auprès du service avant d'être enregistrée. Les clés secrètes sont stockées chiffrées.",
    getKey: (name: string) => `Obtenir une clé sur ${name}`,
    keep: (preview: string) => `Laisse vide pour garder ${preview}.`,
    show: "Afficher",
    hide: "Masquer",
    checking: "Vérification…",
    connectedTo: (name: string) => `${name} connecté.`,
    disconnected: (name: string) => `${name} déconnecté.`,
  },
});

export const integrationsQuery = queryOptions({ queryKey: ["admin", "integrations"], queryFn: () => api<AppIntegration[]>("/admin/integrations") });

/** The server answers every change with the new list; logos depend on logo.dev (the web's brandsQuery). */
export function applyIntegrations(qc: QueryClient, list: AppIntegration[]) {
  qc.setQueryData(integrationsQuery.queryKey, list);
  qc.invalidateQueries({ queryKey: ["brands"] });
}

export const integrationHref = (id: IntegrationId) => `/profile/admin/integrations/${id}` as Href;

/** Disconnects after confirmation; the server's environment variables apply again. */
export function useDisconnect(onDone?: () => void) {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const remove = useMutation({
    mutationFn: (id: IntegrationId) => api<AppIntegration[]>(`/admin/integrations/${id}`, { method: "DELETE" }),
    onSuccess: (list, id) => {
      applyIntegrations(qc, list);
      toast.success(integrationsMessages.disconnected(SPECS[id].name));
      onDone?.();
    },
    onError: (e) => toast.failed(e),
  });
  const ask = async (id: IntegrationId) => {
    const name = SPECS[id].name;
    const t = integrationsMessages;
    if (await confirmAction({ title: t.disconnectTitle(name), description: `${t.disconnectText[id]} ${t.envNote}`, action: t.disconnect })) remove.mutate(id);
  };
  return { ask, remove };
}
