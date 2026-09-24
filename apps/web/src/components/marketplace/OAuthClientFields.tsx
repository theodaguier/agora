import { useId, useState } from "react";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    toggle: "Use my own OAuth client",
    intro: "For services that don't let apps register themselves (GitHub, Google, Slack…): create an OAuth app in the service, declare this redirect address in it, then paste its identifiers.",
    redirect: "Redirect address",
    copy: "Copy",
    copied: "Copied",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretHelp: "Stored only in Hermes's .env.",
    scope: "Scopes",
    scopeHelp: "Separated by spaces. Leave empty to use the service's defaults.",
    needsClient: "This service doesn't accept automatic registration: fill in your own OAuth client below.",
  },
  fr: {
    toggle: "Utiliser mon propre client OAuth",
    intro: "Pour les services qui n'acceptent pas l'enregistrement automatique (GitHub, Google, Slack…) : crée une application OAuth dans le service, déclares-y cette adresse de redirection, puis colle ses identifiants.",
    redirect: "Adresse de redirection",
    copy: "Copier",
    copied: "Copiée",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretHelp: "Stocké uniquement dans le .env de Hermes.",
    scope: "Scopes",
    scopeHelp: "Séparés par des espaces. Laisse vide pour ceux du service.",
    needsClient: "Ce service n'accepte pas l'enregistrement automatique : renseigne ton propre client OAuth ci-dessous.",
  },
});

/**
 * Pre-registered OAuth client, folded by default: most MCP servers register Hermes
 * on their own; the others need an app created by hand in the service.
 */
export function OAuthClientFields(props: {
  redirectUri: string;
  value: { client_id: string; client_secret: string; scope: string };
  onChange: (value: { client_id: string; client_secret: string; scope: string }) => void;
  /** Open, with an explanation, after the service refused automatic registration. */
  required?: boolean;
  disabled?: boolean;
}) {
  const t = useT(messages);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<typeof props.value>) => props.onChange({ ...props.value, ...patch });

  return (
    <Collapsible open={open || !!props.required} onOpenChange={setOpen}>
      {!props.required && (
        <CollapsibleTrigger render={<Button type="button" variant="link" className="h-auto px-0 font-normal text-muted-foreground hover:text-foreground" />}>
          {t.toggle}
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        <FieldGroup className="mt-2 gap-3">
          <FieldDescription className={props.required ? "text-warning" : "text-xs"}>{props.required ? t.needsClient : t.intro}</FieldDescription>
          <Field className="gap-1.5">
            <FormLabel htmlFor={`${id}-redirect`}>{t.redirect}</FormLabel>
            <InputGroup className="bg-background dark:bg-background">
              <InputGroupInput id={`${id}-redirect`} readOnly value={props.redirectUri} className="font-mono text-xs" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  onClick={() =>
                    navigator.clipboard.writeText(props.redirectUri).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                  }
                >
                  {copied ? t.copied : t.copy}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field className="gap-1.5">
            <FormLabel htmlFor={`${id}-client`} required={props.required}>
              {t.clientId}
            </FormLabel>
            <Input
              id={`${id}-client`}
              value={props.value.client_id}
              required={props.required}
              disabled={props.disabled}
              onChange={(e) => set({ client_id: e.target.value })}
              autoComplete="off"
              className="bg-background font-mono"
            />
          </Field>
          <Field className="gap-1.5">
            <FormLabel htmlFor={`${id}-secret`}>{t.clientSecret}</FormLabel>
            <Input
              id={`${id}-secret`}
              type="password"
              value={props.value.client_secret}
              disabled={props.disabled}
              onChange={(e) => set({ client_secret: e.target.value })}
              autoComplete="off"
              className="bg-background font-mono"
            />
            <FieldDescription className="text-xs">{t.secretHelp}</FieldDescription>
          </Field>
          <Field className="gap-1.5">
            <FormLabel htmlFor={`${id}-scope`}>{t.scope}</FormLabel>
            <Input
              id={`${id}-scope`}
              value={props.value.scope}
              disabled={props.disabled}
              onChange={(e) => set({ scope: e.target.value })}
              autoComplete="off"
              className="bg-background font-mono"
            />
            <FieldDescription className="text-xs">{t.scopeHelp}</FieldDescription>
          </Field>
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
