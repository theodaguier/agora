import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FormLabel } from "@/components/FormLabel";
import { OptionSelect, SearchSelect } from "@/components/Pickers";
import { ModelLogo } from "@/components/ProviderLogo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { adminModelsQuery, providersQuery, type AiProvider } from "@/lib/queries";
import { providerName } from "@/lib/providers";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { ErrorText, Loading } from "./ui";

const messages = defineMessages({
  en: {
    title: "AI providers",
    text: "The accounts your agents think with. A key added here is given to every agent.",
    noneTitle: "No provider connected",
    noneText: "Agents can't reply until you add a provider.",
    defaultModel: "Default model",
    notChosen: "Not chosen: agents without a provider can't reply",
    viaKey: (n: number) => (n === 1 ? "API key · 1 model" : `API key · ${n} models`),
    viaServer: (n: number) => (n === 1 ? "Signed in on the server · 1 model" : `Signed in on the server · ${n} models`),
    add: "Add a provider",
    change: "Change",
    replaceKey: "Replace key",
    remove: "Remove",
    removeTitle: (name: string) => `Remove the ${name} key?`,
    removeText: "It is deleted from every agent. Those using this provider stop replying until you pick another one.",
    pickTitle: "Add a provider",
    pickText: "Providers Hermes can use with an API key.",
    search: "Search (OpenAI, Anthropic, Mistral…)",
    noMatch: "No provider matches.",
    keyTitle: (name: string) => `${name} key`,
    keyText: "Checked with the provider, then given to every agent. Hermes restarts to load it (about 10 seconds).",
    apiKey: (env: string) => `API key (${env})`,
    show: "Show",
    hide: "Hide",
    checking: "Checking and restarting Hermes…",
    checkAndSave: "Check and save",
    modelTitle: "Default model",
    modelText: "Hermes then answers a test message with it.",
    provider: "Provider",
    model: "Model",
    searchModel: "Search for a model…",
    baseUrl: "Custom endpoint",
    baseUrlHelp: "Only for an OpenAI-compatible server of your own.",
    testing: "Testing…",
    useAndTest: "Use and test",
    replies: (reply: string) => `The model replies: “${reply}”`,
    switched: (n: number) => (n === 1 ? "1 agent without a provider now uses it." : `${n} agents without a provider now use it.`),
  },
  fr: {
    title: "Fournisseurs d'IA",
    text: "Les comptes qui font réfléchir tes agents. Une clé ajoutée ici est donnée à tous les agents.",
    noneTitle: "Aucun fournisseur connecté",
    noneText: "Les agents ne peuvent pas répondre tant que tu n'as pas ajouté de fournisseur.",
    defaultModel: "Modèle par défaut",
    notChosen: "Pas choisi : les agents sans fournisseur ne peuvent pas répondre",
    viaKey: (n: number) => `Clé API · ${n} modèle${n > 1 ? "s" : ""}`,
    viaServer: (n: number) => `Connecté sur le serveur · ${n} modèle${n > 1 ? "s" : ""}`,
    add: "Ajouter un fournisseur",
    change: "Modifier",
    replaceKey: "Remplacer la clé",
    remove: "Retirer",
    removeTitle: (name: string) => `Retirer la clé ${name} ?`,
    removeText: "Elle est supprimée de tous les agents. Ceux qui utilisent ce fournisseur ne répondent plus tant que tu n'en choisis pas un autre.",
    pickTitle: "Ajouter un fournisseur",
    pickText: "Les fournisseurs que Hermes sait utiliser avec une clé API.",
    search: "Rechercher (OpenAI, Anthropic, Mistral…)",
    noMatch: "Aucun fournisseur ne correspond.",
    keyTitle: (name: string) => `Clé ${name}`,
    keyText: "Vérifiée auprès du fournisseur, puis donnée à tous les agents. Hermes redémarre pour la charger (une dizaine de secondes).",
    apiKey: (env: string) => `Clé API (${env})`,
    show: "Afficher",
    hide: "Masquer",
    checking: "Vérification et redémarrage de Hermes…",
    checkAndSave: "Vérifier et enregistrer",
    modelTitle: "Modèle par défaut",
    modelText: "Hermes répond ensuite à un message de test avec ce modèle.",
    provider: "Fournisseur",
    model: "Modèle",
    searchModel: "Chercher un modèle…",
    baseUrl: "Point d'accès personnalisé",
    baseUrlHelp: "Seulement pour ton propre serveur compatible OpenAI.",
    testing: "Test en cours…",
    useAndTest: "Utiliser et tester",
    replies: (reply: string) => `Le modèle répond : « ${reply} »`,
    switched: (n: number) =>
      n === 1 ? "1 agent sans fournisseur utilise maintenant ce modèle." : `${n} agents sans fournisseur utilisent maintenant ce modèle.`,
  },
});

type Dialogs = { kind: "pick" } | { kind: "key"; provider: AiProvider; next?: boolean } | { kind: "model"; provider?: string };

/** Admin › Models: API keys of the AI providers and the default model. */
export function Providers() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery(providersQuery);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const remove = useMutation({
    mutationFn: (slug: string) => api(`/admin/hermes/providers/${slug}/key`, { method: "DELETE" }),
    onSettled: () => refresh(qc),
  });

  const connected = data?.providers.filter((p) => p.configured) ?? [];
  const current = data && connected.find((p) => p.slug === data.current.provider);

  return (
    <FieldSet>
      <FieldLegend>{t.title}</FieldLegend>
      <FieldDescription>{t.text}</FieldDescription>
      {isPending ? (
        <Loading />
      ) : !data ? (
        <ErrorText error={error} />
      ) : (
        <>
          {connected.length === 0 && (
            <Alert variant="destructive">
              <AlertTitle>{t.noneTitle}</AlertTitle>
              <AlertDescription>{t.noneText}</AlertDescription>
            </Alert>
          )}
          <ItemGroup className="gap-2">
            {connected.length > 0 && (
              <Item variant="outline">
                <ItemMedia>
                  <ModelLogo provider={current?.slug ?? data.current.provider} model={current ? data.current.model : undefined} className="size-5" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{t.defaultModel}</ItemTitle>
                  <ItemDescription className="truncate">
                    {current ? `${providerName(current.slug)} · ${data.current.model}` : t.notChosen}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "model" })}>
                    {t.change}
                  </Button>
                </ItemActions>
              </Item>
            )}
            {connected.map((p) => (
              <Item key={p.slug} variant="outline">
                <ItemMedia>
                  <ModelLogo provider={p.slug} className="size-5" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{p.name}</ItemTitle>
                  <ItemDescription className="truncate">{p.keyEnv ? t.viaKey(p.models.length) : t.viaServer(p.models.length)}</ItemDescription>
                </ItemContent>
                {p.keyEnv && (
                  <ItemActions>
                    <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "key", provider: p })}>
                      {t.replaceKey}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={async () =>
                        (await confirmAction({ title: t.removeTitle(p.name), description: t.removeText, action: t.remove })) && remove.mutate(p.slug)
                      }
                    >
                      {remove.isPending && remove.variables === p.slug ? c.inProgress : t.remove}
                    </Button>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
          <ErrorText error={remove.error} />
          <div>
            <Button variant="outline" onClick={() => setDialog({ kind: "pick" })}>
              {t.add}
            </Button>
          </div>
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {data && dialog?.kind === "pick" && (
          <PickDialog
            providers={data.providers.filter((p) => p.keyEnv && !p.configured)}
            // Nothing works yet without a default model: chain on to it.
            onPick={(p) => setDialog({ kind: "key", provider: p, next: !current })}
          />
        )}
        {dialog?.kind === "key" && (
          <KeyDialog provider={dialog.provider} onSaved={() => setDialog(dialog.next ? { kind: "model", provider: dialog.provider.slug } : null)} />
        )}
        {data && dialog?.kind === "model" && (
          <ModelDialog
            providers={connected}
            initial={dialog.provider ?? current?.slug ?? connected[0]?.slug ?? ""}
            currentModel={data.current.model}
            onClose={() => setDialog(null)}
          />
        )}
      </Dialog>
    </FieldSet>
  );
}

/** Everything that shows the providers or their models. */
const refresh = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: providersQuery.queryKey }),
    qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }),
    qc.invalidateQueries({ queryKey: ["models"] }),
  ]);

function PickDialog({ providers, onPick }: { providers: AiProvider[]; onPick: (p: AiProvider) => void }) {
  const t = useT(messages);
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.pickTitle}</DialogTitle>
        <DialogDescription>{t.pickText}</DialogDescription>
      </DialogHeader>
      <Command className="rounded-xl border border-border p-1">
        <CommandInput placeholder={t.search} autoFocus />
        <CommandList className="max-h-80 pt-1">
          <CommandEmpty>{t.noMatch}</CommandEmpty>
          {providers.map((p) => (
            <CommandItem key={p.slug} value={p.slug} keywords={[p.name]} onSelect={() => onPick(p)} className="h-10 gap-2.5 rounded-lg px-2 text-sm">
              <ModelLogo provider={p.slug} className="size-4" />
              <span className="truncate">{p.name}</span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </DialogContent>
  );
}

function KeyDialog({ provider, onSaved }: { provider: AiProvider; onSaved: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/hermes/providers/${provider.slug}/key`, { method: "PUT", body: JSON.stringify({ apiKey: value.trim() }) }),
    onSuccess: async () => {
      await refresh(qc);
      onSaved();
    },
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.keyTitle(provider.name)}</DialogTitle>
        <DialogDescription>{t.keyText}</DialogDescription>
      </DialogHeader>
      <form
        id="provider-key"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim().length >= 8) save.mutate();
        }}
      >
        <FieldGroup className="gap-5">
          <Field>
            <FormLabel htmlFor="provider-key-value" required>
              {t.apiKey(provider.keyEnv!)}
            </FormLabel>
            <InputGroup>
              <InputGroupInput
                id="provider-key-value"
                className="font-mono"
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                spellCheck={false}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="sm" onClick={() => setShown((s) => !s)}>
                  {shown ? t.hide : t.show}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="provider-key" disabled={value.trim().length < 8 || save.isPending}>
          {save.isPending ? t.checking : t.checkAndSave}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ModelDialog({ providers, initial, currentModel, onClose }: { providers: AiProvider[]; initial: string; currentModel: string; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [slug, setSlug] = useState(initial);
  const models = providers.find((p) => p.slug === slug)?.models ?? [];
  const [model, setModel] = useState(models.includes(currentModel) ? currentModel : (models[0] ?? ""));
  const [baseUrl, setBaseUrl] = useState("");
  const apply = useMutation({
    mutationFn: async () => {
      const { switched } = await api<{ switched: number }>("/admin/hermes/providers/default", {
        method: "PUT",
        body: JSON.stringify({ slug, model, ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}) }),
      });
      const { reply } = await api<{ reply: string }>("/admin/hermes/providers/test", { method: "POST" });
      return { switched, reply };
    },
    onSettled: () => refresh(qc),
  });

  const pickProvider = (next: string) => {
    setSlug(next);
    setModel(providers.find((p) => p.slug === next)?.models[0] ?? "");
    apply.reset();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.modelTitle}</DialogTitle>
        <DialogDescription>{t.modelText}</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-5">
        <Field>
          <FormLabel htmlFor="default-provider" required>
            {t.provider}
          </FormLabel>
          <OptionSelect id="default-provider" options={providers.map((p) => ({ value: p.slug, label: p.name }))} value={slug} onValueChange={pickProvider} />
        </Field>
        <Field>
          <FormLabel htmlFor="default-model" required>
            {t.model}
          </FormLabel>
          <SearchSelect id="default-model" options={models} value={model} onValueChange={(m) => (setModel(m), apply.reset())} placeholder={t.searchModel} />
        </Field>
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="link" className="h-auto p-0 font-normal text-muted-foreground" />}>{t.baseUrl}</CollapsibleTrigger>
          <CollapsibleContent>
            <Field className="mt-2">
              <Input aria-label={t.baseUrl} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
              <FieldDescription>{t.baseUrlHelp}</FieldDescription>
            </Field>
          </CollapsibleContent>
        </Collapsible>
        {apply.data && (
          <Alert>
            <AlertTitle>{t.replies(apply.data.reply)}</AlertTitle>
            {apply.data.switched > 0 && <AlertDescription>{t.switched(apply.data.switched)}</AlertDescription>}
          </Alert>
        )}
        <ErrorText error={apply.error} />
      </FieldGroup>
      <DialogFooter>
        {apply.isSuccess ? (
          <Button onClick={onClose}>{c.close}</Button>
        ) : (
          <>
            <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
            <Button disabled={!slug || !model || apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? t.testing : t.useAndTest}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
