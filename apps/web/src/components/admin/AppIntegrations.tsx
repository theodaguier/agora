import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IntegrationType } from "@agora/core";
import { common } from "@agora/core/i18n";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { MoreIcon } from "@/components/icons";
import { IntegrationTile } from "@/components/marketplace/IntegrationType";
import { toneBadge } from "@/components/views/tone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, useT } from "@/i18n";
import { api, type AppIntegration } from "@/lib/api";
import { brandsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ErrorText, Loading, SectionHeader } from "./ui";

type Id = AppIntegration["id"];
type FieldSpec = { name: string; secret?: boolean; placeholder: string };

/** Each integration: its brand (for the logo), its fields, where to get them. */
const SPECS: Record<Id, { name: string; domain: string; type: IntegrationType; docs: string; fields: FieldSpec[] }> = {
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
};

const messages = defineMessages({
  en: {
    title: "Integrations",
    intro: "Services Agora itself runs on. Your agents' connectors are set in each agent.",
    purpose: {
      resend: "Sends invitation and password reset emails.",
      logodev: "Shows brand logos in conversations and connectors.",
    } as Record<Id, string>,
    fields: {
      apiKey: "API key",
      from: "Sender",
      publishableKey: "Publishable key",
    } as Record<string, string>,
    help: {
      apiKey: "A “Sending access” key is enough.",
      from: "Its domain must be verified in Resend.",
      publishableKey: "The pk_… key: it's made to be read by the browser.",
    } as Record<string, string>,
    connected: "Connected",
    fromEnv: "From the environment",
    connect: "Connect",
    edit: "Edit",
    more: (name: string) => `More actions for ${name}`,
    disconnect: "Disconnect",
    disconnectTitle: (name: string) => `Disconnect ${name}?`,
    disconnectText: {
      resend: "Invitation links will only be shown to the admin, and password reset emails won't be sent anymore.",
      logodev: "Conversations and connectors show generic icons again.",
    } as Record<Id, string>,
    envNote: "The server's environment variables will apply again, if any.",
    dialogTitle: (name: string) => `Connect ${name}`,
    dialogText: "Checked with the service before being saved. Secret keys are stored encrypted.",
    getKey: (name: string) => `Get a key on ${name}`,
    keep: (preview: string) => `Leave empty to keep ${preview}.`,
    show: "Show",
    hide: "Hide",
    checking: "Checking…",
  },
  fr: {
    title: "Intégrations",
    intro: "Services sur lesquels Agora s'appuie pour fonctionner. Les connecteurs de tes agents se règlent dans chaque agent.",
    purpose: {
      resend: "Envoie les emails d'invitation et de réinitialisation du mot de passe.",
      logodev: "Affiche le logo des marques dans les conversations et les connecteurs.",
    },
    fields: {
      apiKey: "Clé API",
      from: "Expéditeur",
      publishableKey: "Clé publique",
    },
    help: {
      apiKey: "Une clé « Sending access » suffit.",
      from: "Son domaine doit être vérifié dans Resend.",
      publishableKey: "La clé pk_… : elle est faite pour être lue par le navigateur.",
    },
    connected: "Connecté",
    fromEnv: "Via l'environnement",
    connect: "Connecter",
    edit: "Modifier",
    more: (name: string) => `Plus d'actions pour ${name}`,
    disconnect: "Déconnecter",
    disconnectTitle: (name: string) => `Déconnecter ${name} ?`,
    disconnectText: {
      resend: "Les liens d'invitation ne seront plus qu'affichés à l'admin, et les emails de réinitialisation du mot de passe ne partiront plus.",
      logodev: "Les conversations et les connecteurs retrouvent des icônes génériques.",
    },
    envNote: "Les variables d'environnement du serveur s'appliqueront de nouveau, s'il y en a.",
    dialogTitle: (name: string) => `Connecter ${name}`,
    dialogText: "Vérifiée auprès du service avant d'être enregistrée. Les clés secrètes sont stockées chiffrées.",
    getKey: (name: string) => `Obtenir une clé sur ${name}`,
    keep: (preview: string) => `Laisse vide pour garder ${preview}.`,
    show: "Afficher",
    hide: "Masquer",
    checking: "Vérification…",
  },
});

const integrationsQuery = { queryKey: ["admin", "integrations"], queryFn: () => api<AppIntegration[]>("/admin/integrations") };

/** Settings › Integrations (admin): the third-party services the app itself uses. */
export function AppIntegrations() {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data, error, isPending } = useQuery(integrationsQuery);
  const [editing, setEditing] = useState<Id | null>(null);
  const onChange = (list: AppIntegration[]) => {
    qc.setQueryData(integrationsQuery.queryKey, list);
    qc.invalidateQueries({ queryKey: brandsQuery.queryKey });
  };
  const remove = useMutation({
    mutationFn: (id: Id) => api<AppIntegration[]>(`/admin/integrations/${id}`, { method: "DELETE" }),
    onSuccess: onChange,
  });

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />
      <ErrorText error={error ?? remove.error} />
      {isPending ? (
        <Loading />
      ) : (
        <ItemGroup className="gap-2">
          {data?.map((i) => {
            const spec = SPECS[i.id];
            const details = spec.fields.map((f) => i.values[f.name]).filter(Boolean);
            return (
              <Item key={i.id} variant="outline">
                <ItemMedia>
                  <IntegrationTile type={spec.type} domain={spec.domain} className="size-10 rounded-lg" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>
                    {spec.name}
                    {i.source && (
                      <Badge variant="secondary" className={cn("font-normal", toneBadge[i.source === "app" ? "success" : "neutral"])}>
                        {i.source === "app" ? t.connected : t.fromEnv}
                      </Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription className="truncate">{t.purpose[i.id]}</ItemDescription>
                  {details.length > 0 && <ItemDescription className="truncate font-mono text-xs">{details.join(" · ")}</ItemDescription>}
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" onClick={() => setEditing(i.id)}>
                    {i.source ? t.edit : t.connect}
                  </Button>
                  {i.source === "app" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.more(spec.name)} />}>
                        <MoreIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={async () =>
                            (await confirmAction({
                              title: t.disconnectTitle(spec.name),
                              description: `${t.disconnectText[i.id]} ${t.envNote}`,
                              action: t.disconnect,
                            })) && remove.mutate(i.id)
                          }
                        >
                          {t.disconnect}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <IntegrationDialog
            key={editing}
            integration={data!.find((i) => i.id === editing)!}
            onSaved={(list) => {
              onChange(list);
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function IntegrationDialog({ integration, onSaved }: { integration: AppIntegration; onSaved: (list: AppIntegration[]) => void }) {
  const t = useT(messages);
  const c = useT(common);
  const spec = SPECS[integration.id];
  // Secrets start empty (only their preview is known); the other values are prefilled.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.name, f.secret ? "" : (integration.values[f.name] ?? "")])),
  );
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: () => api<AppIntegration[]>(`/admin/integrations/${integration.id}`, { method: "PUT", body: JSON.stringify(values) }),
    onSuccess: onSaved,
  });
  // A secret already set can stay empty: the server keeps it.
  const required = (f: FieldSpec) => !(f.secret && integration.values[f.name]);
  const valid = spec.fields.every((f) => !required(f) || values[f.name]?.trim());
  const formId = `integration-${integration.id}`;

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.dialogTitle(spec.name)}</DialogTitle>
        <DialogDescription>
          {t.dialogText}{" "}
          <a href={spec.docs} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
            {t.getKey(spec.name)}
          </a>
        </DialogDescription>
      </DialogHeader>
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <FieldGroup className="gap-5">
          {spec.fields.map((f, n) => {
            const id = `${formId}-${f.name}`;
            const props = {
              id,
              className: "font-mono",
              autoComplete: "off",
              spellCheck: false,
              autoFocus: n === 0,
              placeholder: f.placeholder,
              value: values[f.name] ?? "",
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [f.name]: e.target.value })),
            };
            const preview = f.secret ? integration.values[f.name] : undefined;
            return (
              <Field key={f.name}>
                <FormLabel htmlFor={id} required={required(f)}>
                  {t.fields[f.name]}
                </FormLabel>
                {f.secret ? (
                  <InputGroup>
                    <InputGroupInput {...props} type={shown ? "text" : "password"} autoComplete="new-password" />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton size="sm" onClick={() => setShown((s) => !s)}>
                        {shown ? t.hide : t.show}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                ) : (
                  <Input {...props} />
                )}
                <FieldDescription>{preview ? t.keep(preview) : t.help[f.name]}</FieldDescription>
              </Field>
            );
          })}
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form={formId} disabled={!valid || save.isPending}>
          {save.isPending ? t.checking : c.save}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
