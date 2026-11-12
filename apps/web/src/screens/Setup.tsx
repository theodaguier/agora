import { soulTemplate } from "@agora/core";
import { languageLabel } from "@/lib/languages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, GlobeIcon, SearchIcon } from "@/components/icons";
import { useMemo, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { type AvatarShape } from "@/lib/agent-avatar";
import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/FormLabel";
import { Field, FieldDescription, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AvatarPicker } from "@/components/admin/AvatarPicker";
import { avatarColors } from "@/lib/agent-avatar";
import { SearchSelect } from "@/components/Pickers";
import { ModelLogo } from "@/components/ProviderLogo";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { setupQuery } from "@/lib/org";
import { adminAgentsQuery, agentsQuery } from "@/lib/queries";
import { defineMessages, getLocale, setLocale, tr, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

type Step = "welcome" | "account" | "provider" | "agent" | "done";
const STEPS: Step[] = ["welcome", "account", "provider", "agent"];

type Provider = { slug: string; name: string; keyEnv: string | null; configured: boolean; models: string[] };

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : tr(common).unknownError);

const messages = defineMessages({
  en: {
    progress: (step: number, total: number) => `Step ${step} of ${total}`,
    welcomeTitle: "Welcome to Agora",
    welcomeText: "Your Hermes agents, in a messenger, for your whole team. A few settings and you're good to go.",
    language: "Language",
    languageHint: "Language of the interface and the default language of the agents; everyone can pick their own.",
    timezone: "Time zone",
    searchTimezone: "Search for a time zone",
    timezoneHint: "Used for dates and for the overnight window of automatic updates.",
    start: "Get started",
    accountTitle: "Your organization",
    accountText: "You'll be the administrator: you'll then invite your team and set up the agents.",
    setupCode: "Installation code",
    setupCodeHint: "Printed in the server logs at startup. On the server: ./agora setup-code",
    orgName: "Organization name",
    orgNamePlaceholder: "My company",
    firstName: "First name",
    lastName: "Last name",
    title: "Role",
    titlePlaceholder: "Founder, developer…",
    username: "Username",
    usernamePlaceholder: "first.last",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    passwordPlaceholder: "10 characters minimum",
    confirm: "Confirm password",
    mismatch: "The two passwords don't match.",
    creatingAccount: "Creating account…",
    createAccount: "Create account",
    providerTitle: "AI provider",
    providerText: "The model your agents think with. You can change it later, and pick one per agent.",
    loadingProviders: "Loading Hermes's provider list…",
    hermesDown: "Is Hermes running?",
    providersError: "The provider list can't be reached right now. Is Hermes running?",
    noProviderMatch: "No provider matches.",
    searchProvider: "Search for a provider",
    searchProviderPlaceholder: "Search (OpenAI, Anthropic, Mistral…)",
    configured: "configured",
    change: "Change",
    apiKey: (env: string | null) => `API key (${env})`,
    apiKeyPlaceholder: "Paste your key here",
    apiKeyHint: "Checked with the provider, then stored in Hermes (never in the browser).",
    checkingKey: "Checking key…",
    checkAndSave: "Check and save",
    unverified: "Key saved (the provider couldn't be reached to check it).",
    defaultModel: "Default model",
    searchModel: "Search for a model",
    advancedBaseUrl: "Advanced: API address",
    baseUrlPlaceholder: "https://… (only for a specific endpoint)",
    modelReplies: (reply: string) => `The model replies: “${reply}”`,
    testing: "Testing a real reply…",
    useAndTest: "Use and test",
    later: "Later",
    agentTitle: "Your first agent",
    agentText: "An agent = a Hermes profile, with its own personality, memory and tools. You'll create more later.",
    name: "Name",
    role: "Its role",
    rolePlaceholder: "E.g. Answers the team's questions, drafts emails, summarizes documents.",
    roleHint: "Becomes its personality (SOUL.md), editable later.",
    showSoul: "See the generated personality",
    creatingProfile: "Creating Hermes profile…",
    createAgent: "Create agent",
    doneTitle: "You're all set",
    doneText: "Invite your team from the settings, and add tools, skills and connectors from the Marketplace.",
    opening: "Opening…",
    talkToAgent: "Talk to my agent",
    openAgora: "Open Agora",
  },
  fr: {
    progress: (step: number, total: number) => `Étape ${step} sur ${total}`,
    welcomeTitle: "Bienvenue sur Agora",
    welcomeText: "Tes agents Hermes, en messagerie, pour toute ton équipe. Quelques réglages et c'est parti.",
    language: "Langue",
    languageHint: "Langue de l'interface et langue par défaut des agents ; chacun pourra choisir la sienne.",
    timezone: "Fuseau horaire",
    searchTimezone: "Rechercher un fuseau",
    timezoneHint: "Sert aux dates et à la plage nocturne des mises à jour automatiques.",
    start: "Commencer",
    accountTitle: "Ton organisation",
    accountText: "Tu seras l'administrateur : tu inviteras ensuite ton équipe et configureras les agents.",
    setupCode: "Code d'installation",
    setupCodeHint: "Affiché dans les logs du serveur au démarrage. Sur le serveur : ./agora setup-code",
    orgName: "Nom de l'organisation",
    orgNamePlaceholder: "Mon entreprise",
    firstName: "Prénom",
    lastName: "Nom",
    title: "Rôle",
    titlePlaceholder: "Fondateur, développeur…",
    username: "Username",
    usernamePlaceholder: "prenom.nom",
    email: "Email",
    emailPlaceholder: "toi@exemple.com",
    password: "Mot de passe",
    passwordPlaceholder: "10 caractères minimum",
    confirm: "Confirmation",
    mismatch: "Les deux mots de passe ne correspondent pas.",
    creatingAccount: "Création du compte…",
    createAccount: "Créer le compte",
    providerTitle: "Fournisseur d'IA",
    providerText: "Le modèle qui fait réfléchir tes agents. Tu pourras en changer, et en choisir un par agent.",
    loadingProviders: "Chargement de la liste des fournisseurs de Hermes…",
    hermesDown: "Hermes tourne-t-il ?",
    providersError: "La liste des fournisseurs est injoignable pour le moment. Hermes tourne-t-il ?",
    noProviderMatch: "Aucun fournisseur ne correspond.",
    searchProvider: "Rechercher un fournisseur",
    searchProviderPlaceholder: "Rechercher (OpenAI, Anthropic, Mistral…)",
    configured: "configuré",
    change: "Changer",
    apiKey: (env: string | null) => `Clé API (${env})`,
    apiKeyPlaceholder: "Colle ta clé ici",
    apiKeyHint: "Vérifiée auprès du fournisseur, puis stockée dans Hermes (jamais dans le navigateur).",
    checkingKey: "Vérification de la clé…",
    checkAndSave: "Vérifier et enregistrer",
    unverified: "Clé enregistrée (le fournisseur n'a pas pu être joint pour la vérifier).",
    defaultModel: "Modèle par défaut",
    searchModel: "Rechercher un modèle",
    advancedBaseUrl: "Avancé : adresse de l'API",
    baseUrlPlaceholder: "https://… (seulement pour un point d'accès particulier)",
    modelReplies: (reply: string) => `Le modèle répond : « ${reply} »`,
    testing: "Test d'une vraie réponse…",
    useAndTest: "Utiliser et tester",
    later: "Plus tard",
    agentTitle: "Ton premier agent",
    agentText: "Un agent = un profil Hermes, avec sa personnalité, sa mémoire et ses outils. Tu en créeras d'autres ensuite.",
    name: "Nom",
    role: "Son rôle",
    rolePlaceholder: "Ex. Répond aux questions de l'équipe, rédige des emails, résume des documents.",
    roleHint: "Devient sa personnalité (SOUL.md), modifiable ensuite.",
    showSoul: "Voir la personnalité générée",
    creatingProfile: "Création du profil Hermes…",
    createAgent: "Créer l'agent",
    doneTitle: "C'est prêt",
    doneText: "Invite ton équipe depuis les paramètres, et ajoute des outils, skills et connecteurs depuis le Marketplace.",
    opening: "Ouverture…",
    talkToAgent: "Parler à mon agent",
    openAgora: "Ouvrir Agora",
  },
});

/** First-run wizard: organization, admin account, AI provider, first agent. */
export function Setup() {
  const { data: status } = useQuery(setupQuery);
  // Fresh instance: start from the beginning; otherwise (admin signed in, setup unfinished) resume.
  const [step, setStep] = useState<Step>(() => (status?.needed === false ? "provider" : "welcome"));
  const [prefs, setPrefs] = useState({
    // Starts from the interface language so the wizard and the choice agree.
    locale: getLocale(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris",
  });
  const [agentId, setAgentId] = useState<string | null>(null);

  return (
    <div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10 md:pt-28">
      <Card className="w-full max-w-md">
        {step !== "done" && (
          <CardContent>
            <StepProgress current={step} />
          </CardContent>
        )}
        {step === "welcome" && (
          <Welcome
            prefs={prefs}
            onChange={(p) => {
              // The organization language applies to the interface too: switch the wizard live.
              if (p.locale !== prefs.locale) setLocale(p.locale);
              setPrefs(p);
            }}
            onNext={() => setStep("account")}
          />
        )}
        {step === "account" && <Account prefs={prefs} onBack={() => setStep("welcome")} onNext={() => setStep("provider")} />}
        {step === "provider" && <ProviderStep onNext={() => setStep("agent")} />}
        {step === "agent" && (
          <AgentStep
            orgName={status?.org.name ?? "Agora"}
            locale={status?.org.locale ?? prefs.locale}
            onNext={(id) => {
              setAgentId(id);
              setStep("done");
            }}
          />
        )}
        {step === "done" && <Done agentId={agentId} />}
      </Card>
    </div>
  );
}

function StepProgress({ current }: { current: Step }) {
  const index = STEPS.indexOf(current);
  const t = useT(messages);
  return <Progress value={((index + 1) / STEPS.length) * 100} aria-label={t.progress(index + 1, STEPS.length)} />;
}

function Header({ title, text, media }: { title: string; text: ReactNode; media?: ReactNode }) {
  return (
    <CardHeader>
      {media}
      <CardTitle>{title}</CardTitle>
      <CardDescription>{text}</CardDescription>
    </CardHeader>
  );
}

function Welcome(props: {
  prefs: { locale: "fr" | "en"; timezone: string };
  onChange: (p: { locale: "fr" | "en"; timezone: string }) => void;
  onNext: () => void;
}) {
  const t = useT(messages);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [props.prefs.timezone];
    }
  }, [props.prefs.timezone]);
  return (
    <>
      <Header title={t.welcomeTitle} text={t.welcomeText} media={<AgentAvatar agent={{ avatar: { shape: "bean", color: "#9a7cf0" } }} className="size-9" />} />
      <CardContent>
      <FieldGroup>
        <Field>
          <FormLabel required>{t.language}</FormLabel>
          <ToggleGroup
            aria-label={t.language}
            value={[props.prefs.locale]}
            onValueChange={(v) => v[0] && props.onChange({ ...props.prefs, locale: v[0] as "fr" | "en" })}
            variant="outline"
            spacing={2}
          >
            {(["fr", "en"] as const).map((l) => (
              <ToggleGroupItem key={l} value={l}>
                {languageLabel(l)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>{t.languageHint}</FieldDescription>
        </Field>
        <Field>
          <FormLabel htmlFor="tz" required>
            {t.timezone}
          </FormLabel>
          <SearchSelect
            id="tz"
            options={zones}
            value={props.prefs.timezone}
            onValueChange={(timezone) => props.onChange({ ...props.prefs, timezone })}
            label={(z) => z.replaceAll("_", " ")}
            icon={() => <GlobeIcon />}
            placeholder={t.searchTimezone}
          />
          <FieldDescription>{t.timezoneHint}</FieldDescription>
        </Field>
        <Field>
          <Button className="w-full" onClick={props.onNext}>
            {t.start}
          </Button>
        </Field>
      </FieldGroup>
      </CardContent>
    </>
  );
}

function Account(props: { prefs: { locale: "fr" | "en"; timezone: string }; onBack: () => void; onNext: () => void }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const [mismatch, setMismatch] = useState(false);
  const create = useMutation({
    mutationFn: (body: Record<string, string>) => api("/setup/account", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await authClient.getSession({ query: { disableCookieCache: true } });
      await qc.invalidateQueries();
      props.onNext();
    },
    meta: { error: false },
  });

  return (
    <>
    <Header title={t.accountTitle} text={t.accountText} />
    <CardContent>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        if (f.password !== f.confirm) return setMismatch(true);
        setMismatch(false);
        create.mutate({
          orgName: f.orgName!,
          firstName: f.firstName!,
          lastName: f.lastName!,
          title: f.title!,
          username: f.username!,
          email: f.email!,
          password: f.password!,
          setupCode: f.setupCode!,
          locale: props.prefs.locale,
          timezone: props.prefs.timezone,
        });
      }}
    >
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <SetupField label={t.setupCode} name="setupCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={100} placeholder="XXXX-XXXX-XXXX" autoFocus />
          <FieldDescription>{t.setupCodeHint}</FieldDescription>
        </div>
        <SetupField label={t.orgName} name="orgName" placeholder={t.orgNamePlaceholder} />
        <div className="grid grid-cols-2 gap-4">
          <SetupField label={t.firstName} name="firstName" autoComplete="given-name" />
          <SetupField label={t.lastName} name="lastName" autoComplete="family-name" />
          <SetupField label={t.title} name="title" maxLength={60} placeholder={t.titlePlaceholder} />
          <SetupField label={t.username} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={30} pattern="[a-zA-Z0-9._]{2,30}" placeholder={t.usernamePlaceholder} />
        </div>
        <SetupField label={t.email} name="email" type="email" autoComplete="email" placeholder={t.emailPlaceholder} />
        <SetupField label={t.password} name="password" type="password" autoComplete="new-password" minLength={10} placeholder={t.passwordPlaceholder} />
        <SetupField label={t.confirm} name="confirm" type="password" autoComplete="new-password" minLength={10} invalid={mismatch} />
        {mismatch && <FieldError>{t.mismatch}</FieldError>}
        {create.error && <FieldError>{errorText(create.error)}</FieldError>}
        <Field orientation="horizontal">
          <Button type="button" variant="ghost" onClick={props.onBack}>
            {c.back}
          </Button>
          <Button type="submit" className="flex-1" disabled={create.isPending}>
            {create.isPending ? t.creatingAccount : t.createAccount}
          </Button>
        </Field>
      </FieldGroup>
    </form>
    </CardContent>
    </>
  );
}

function ProviderStep({ onNext }: { onNext: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["setup", "providers"], queryFn: () => api<{ current: { provider: string; model: string }; providers: Provider[] }>("/setup/providers") });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Provider | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [tested, setTested] = useState<string | null>(null);

  const pick = (p: Provider) => {
    setSelected(p);
    setModels(p.configured ? p.models : []);
    setModel(p.slug === providers.data?.current.provider ? providers.data.current.model : (p.models[0] ?? ""));
    setTested(null);
  };
  const saveKey = useMutation({
    mutationFn: (apiKey: string) => api<{ models: string[]; unverified: boolean }>("/setup/provider", { method: "POST", body: JSON.stringify({ slug: selected!.slug, apiKey }) }),
    onSuccess: (r) => {
      setModels(r.models);
      setModel(r.models[0] ?? "");
      // The provider now shows as configured.
      qc.invalidateQueries({ queryKey: ["setup", "providers"] });
    },
    meta: { error: false },
  });
  const apply = useMutation({
    mutationFn: async () => {
      await api("/setup/model", { method: "POST", body: JSON.stringify({ slug: selected!.slug, model, ...(baseUrl ? { baseUrl } : {}) }) });
      return api<{ reply: string }>("/setup/test", { method: "POST" });
    },
    onSuccess: (r) => {
      setTested(r.reply);
      qc.invalidateQueries({ queryKey: ["setup", "providers"] });
    },
    meta: { error: false },
  });

  const list = (providers.data?.providers ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Header title={t.providerTitle} text={t.providerText} />
      <CardContent className="flex flex-col gap-4">
      {providers.isPending && (
        <div className="flex flex-col gap-2" aria-label={t.loadingProviders}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}
      {providers.error && (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground" title={errorText(providers.error)}>
            {t.providersError}
          </p>
          <Button variant="secondary" size="sm" disabled={providers.isFetching} onClick={() => void providers.refetch()}>
            {c.retry}
          </Button>
        </div>
      )}

      {providers.data && !selected && (
        <>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchProvider} placeholder={t.searchProviderPlaceholder} />
          </InputGroup>
          <ItemGroup className="max-h-80 overflow-y-auto">
            {list.map((p) => (
              <Item key={p.slug} variant="outline" size="sm" render={<button type="button" onClick={() => pick(p)} />}>
                <ItemContent>
                  <ItemTitle>{p.name}</ItemTitle>
                </ItemContent>
                {p.configured && (
                  <ItemActions>
                    <Badge variant="secondary">{t.configured}</Badge>
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
          {!list.length && <p className="text-sm text-muted-foreground">{t.noProviderMatch}</p>}
        </>
      )}

      {selected && (
        <div className="flex flex-col gap-4">
          <Item variant="muted" size="sm">
            <ItemContent>
              <ItemTitle>{selected.name}</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Button variant="link" size="sm" onClick={() => setSelected(null)}>
                {t.change}
              </Button>
            </ItemActions>
          </Item>
          {!selected.configured && !models.length && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveKey.mutate(String(new FormData(e.currentTarget).get("apiKey")));
              }}
            >
              <FieldGroup>
                <div className="flex flex-col gap-2">
                  <SetupField label={t.apiKey(selected.keyEnv)} name="apiKey" type="password" autoComplete="off" placeholder={t.apiKeyPlaceholder} />
                  <FieldDescription>{t.apiKeyHint}</FieldDescription>
                </div>
                {saveKey.error && <FieldError>{errorText(saveKey.error)}</FieldError>}
                <Field>
                  <Button type="submit" className="w-full" disabled={saveKey.isPending}>
                    {saveKey.isPending ? t.checkingKey : t.checkAndSave}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
          {models.length > 0 && (
            <>
              {saveKey.data?.unverified && <p className="text-xs text-muted-foreground">{t.unverified}</p>}
              <Field>
                <FormLabel htmlFor="model" required>
                  {t.defaultModel}
                </FormLabel>
                <SearchSelect id="model" options={models} value={model} onValueChange={setModel} icon={(m) => <ModelLogo model={m} provider={selected?.slug ?? ""} />} placeholder={t.searchModel} />
              </Field>
              <Collapsible className="flex flex-col gap-2">
                <CollapsibleTrigger render={<Button variant="link" size="sm" className="self-start" />}>{t.advancedBaseUrl}</CollapsibleTrigger>
                <CollapsibleContent>
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} aria-label={t.advancedBaseUrl} placeholder={t.baseUrlPlaceholder} />
                </CollapsibleContent>
              </Collapsible>
              {apply.error && <FieldError>{errorText(apply.error)}</FieldError>}
              {tested ? (
                <Alert>
                  <CheckIcon />
                  <AlertTitle>{t.modelReplies(tested)}</AlertTitle>
                </Alert>
              ) : (
                <Button onClick={() => apply.mutate()} disabled={!model || apply.isPending}>
                  {apply.isPending ? t.testing : t.useAndTest}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onNext}>
          {t.later}
        </Button>
        <Button className="flex-1" disabled={!tested} onClick={onNext}>
          {c.continue}
        </Button>
      </div>
      </CardContent>
    </>
  );
}

function AgentStep(props: { orgName: string; locale: "fr" | "en"; onNext: (id: string | null) => void }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [name, setName] = useState("Assistant");
  const [shape, setShape] = useState<AvatarShape>("bean");
  const [color, setColor] = useState(avatarColors[5]!);
  const [role, setRole] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/setup/agent", { method: "POST", body: JSON.stringify({ name, role, avatarShape: shape, avatarColor: color }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      qc.invalidateQueries({ queryKey: adminAgentsQuery.queryKey });
      props.onNext(r.id);
    },
    meta: { error: false },
  });

  return (
    <>
      <Header title={t.agentTitle} text={t.agentText} />
      <CardContent>
      <FieldGroup>
      <div className="flex flex-col items-center gap-3">
        <AgentAvatar agent={{ avatar: { shape, color } }} className="size-20" />
        <AvatarPicker shape={shape} color={color} onShapeChange={setShape} onColorChange={setColor} centered />
      </div>
        <Field>
          <FormLabel htmlFor="agent-name" required>
            {t.name}
          </FormLabel>
          <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field>
          <FormLabel htmlFor="agent-role">
            {t.role}
          </FormLabel>
          <Textarea
            id="agent-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            rows={4}
            placeholder={messages[props.locale].rolePlaceholder}
          />
          <FieldDescription>{t.roleHint}</FieldDescription>
        </Field>
      <Collapsible className="flex flex-col gap-2">
        <CollapsibleTrigger render={<Button variant="link" size="sm" className="self-start" />}>{t.showSoul}</CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {soulTemplate({ name: name || "Assistant", org: props.orgName, locale: props.locale, role })}
          </pre>
        </CollapsibleContent>
      </Collapsible>
      {create.error && <FieldError>{errorText(create.error)}</FieldError>}
      <Field orientation="horizontal">
        <Button variant="ghost" onClick={() => props.onNext(null)}>
          {t.later}
        </Button>
        <Button className="flex-1" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? t.creatingProfile : t.createAgent}
        </Button>
      </Field>
      </FieldGroup>
      </CardContent>
    </>
  );
}

function Done({ agentId }: { agentId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT(messages);
  const finish = useMutation({
    mutationFn: () => api("/setup/complete", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["setup"] });
      navigate(agentId ? { to: "/a/$agentId", params: { agentId } } : { to: "/" });
    },
    meta: { error: false },
  });
  return (
    <>
      <Header title={t.doneTitle} text={t.doneText} media={<CheckIcon className="size-6" />} />
      <CardContent className="flex flex-col gap-4">
        {finish.error && <FieldError>{errorText(finish.error)}</FieldError>}
        <Button className="w-full" onClick={() => finish.mutate()} disabled={finish.isPending}>
          {finish.isPending ? t.opening : agentId ? t.talkToAgent : t.openAgora}
        </Button>
      </CardContent>
    </>
  );
}

function SetupField({ label, invalid, required = true, ...input }: { label: string; invalid?: boolean; required?: boolean } & React.ComponentProps<"input">) {
  const id = `setup-${input.name}`;
  return (
    <Field>
      <FormLabel htmlFor={id} required={required}>
        {label}
      </FormLabel>
      <Input id={id} required={required} aria-invalid={invalid || undefined} {...input} />
    </Field>
  );
}
