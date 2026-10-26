import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { BotIcon, BuildingIcon, CalendarClockIcon, FileTextIcon, CheckCircleIcon, LayersIcon, PaletteIcon, BrainIcon, ChartIcon, KeyIcon, LockIcon, RefreshIcon, PlugIcon, ServerIcon, SlidersIcon, ShieldCheckIcon, SmartphoneIcon, UsersIcon, CloseIcon, SearchIcon, type IconComponent } from "@/components/icons";
import { lazy, Suspense, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useDesktop } from "@/lib/workspace";
import { Access } from "@/components/admin/Access";
import { AppIntegrations } from "@/components/admin/AppIntegrations";
import { Agents } from "@/components/admin/Agents";
import { Models } from "@/components/admin/Models";
import { OrgSettings } from "@/components/admin/OrgSettings";
import { Loading, RestartProvider, SectionHeader } from "@/components/admin/ui";
import { NewBotsAllTools, RequireTwoFactor } from "@/components/admin/Security";
import { Status } from "@/components/admin/Status";
import { Updates } from "@/components/admin/Updates";
import { Users } from "@/components/admin/Users";
import { Vault } from "@/components/admin/Vault";
import { Appearance } from "@/components/Appearance";
import { MobileApp } from "@/components/MobileApp";
import { TwoFactor } from "@/components/TwoFactor";
import { AvailabilityEditor } from "@/components/AvailabilityEditor";
import { WikiMemory } from "@/components/admin/WikiMemory";
import { DigestSettings } from "@/components/admin/DigestSettings";
import { AvatarField, ProfileFields, type AvatarChange } from "@/components/ProfileFields";
import { readProfile } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { api, uploadAvatar, type ProfileInput } from "@/lib/api";
import { authClient } from "@/lib/auth";
import { closeSettings, openSettings, type SettingsTab, useSettingsTab } from "@/lib/settings";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { cn } from "@/lib/utils";

// Recharts only loads with the usage and server tabs.
const Usage = lazy(() => import("@/components/Usage").then((m) => ({ default: m.Usage })));
const Server = lazy(() => import("@/components/admin/Server").then((m) => ({ default: m.Server })));

type Group = "account" | "organization" | "instance";

const tabs: { id: SettingsTab; icon: IconComponent; group: Group; admin?: true }[] = [
  { id: "general", icon: SlidersIcon, group: "account" },
  { id: "security", icon: ShieldCheckIcon, group: "account" },
  { id: "availability", icon: CalendarClockIcon, group: "account" },
  { id: "appearance", icon: PaletteIcon, group: "account" },
  { id: "mobile", icon: SmartphoneIcon, group: "account" },
  { id: "usage", icon: ChartIcon, group: "account" },
  { id: "organization", icon: BuildingIcon, group: "organization", admin: true },
  { id: "users", icon: UsersIcon, group: "organization", admin: true },
  { id: "agents", icon: BotIcon, group: "organization", admin: true },
  { id: "access", icon: KeyIcon, group: "organization", admin: true },
  { id: "vault", icon: LockIcon, group: "organization", admin: true },
  { id: "integrations", icon: PlugIcon, group: "organization", admin: true },
  { id: "models", icon: LayersIcon, group: "organization", admin: true },
  { id: "memory", icon: BrainIcon, group: "organization", admin: true },
  { id: "digest", icon: FileTextIcon, group: "organization", admin: true },
  { id: "status", icon: CheckCircleIcon, group: "instance", admin: true },
  { id: "server", icon: ServerIcon, group: "instance", admin: true },
  { id: "updates", icon: RefreshIcon, group: "instance", admin: true },
];

const messages = defineMessages({
  en: {
    settings: "Settings",
    tabs: {
      general: "General",
      security: "Security",
      availability: "Availability",
      appearance: "Appearance",
      mobile: "Mobile app",
      organization: "Organization",
      users: "Users",
      agents: "Agents",
      access: "Access",
      vault: "Vault",
      integrations: "Integrations",
      models: "Models",
      memory: "Memory",
      digest: "Recaps",
      usage: "Usage",
      status: "Status",
      server: "Server",
      updates: "Updates",
    } as Record<SettingsTab, string>,
    profile: "Profile",
    account: "Account",
    groups: { account: "Account", organization: "Organization", instance: "Instance" } as Record<Group, string>,
    search: "Search settings",
    noMatch: "No setting matches.",
    yourAccount: "Your account",
    organization: "Organization",
    admin: "Admin",
    member: "Member",
    signOut: "Sign out",
    profileSaved: "Profile saved.",
    availabilityHelp: "Colleagues and bots see when you're away or outside your working hours: they're told before writing to you, and bots avoid calling on you.",
  },
  fr: {
    settings: "Paramètres",
    tabs: {
      general: "Général",
      security: "Sécurité",
      availability: "Disponibilité",
      appearance: "Apparence",
      mobile: "App mobile",
      organization: "Organisation",
      users: "Utilisateurs",
      agents: "Agents",
      access: "Accès",
      vault: "Coffre",
      integrations: "Intégrations",
      models: "Modèles",
      memory: "Mémoire",
      digest: "Récaps",
      usage: "Consommation",
      status: "Statut",
      server: "Serveur",
      updates: "Mises à jour",
    },
    profile: "Profil",
    account: "Compte",
    groups: { account: "Compte", organization: "Organisation", instance: "Instance" },
    search: "Rechercher un réglage",
    noMatch: "Aucun réglage ne correspond.",
    yourAccount: "Ton compte",
    organization: "Organisation",
    admin: "Admin",
    member: "Membre",
    signOut: "Se déconnecter",
    profileSaved: "Profil enregistré.",
    availabilityHelp: "Tes collègues et les bots voient quand tu es absent·e ou hors de tes horaires : ils sont prévenus avant de t'écrire, et les bots évitent de te solliciter.",
  },
});

/**
 * Figma « Fenêtre · Paramètres »: a modal over the app (full screen on a phone), its navigation on the
 * left. Mounted once in AppShell; opened via openSettings().
 */
export function Settings() {
  const tab = useSettingsTab();
  const t = useT(messages);
  const c = useT(common);
  // Content stays visible during the close animation; each opening starts from the requested tab.
  const [prev, setPrev] = useState(tab);
  const [opened, setOpened] = useState({ tab: tab ?? "general", n: 0 });
  if (tab !== prev) {
    setPrev(tab);
    if (tab) setOpened((o) => ({ tab, n: o.n + 1 }));
  }

  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(88vh,720px)] sm:w-[calc(100%-3rem)] sm:max-w-[920px] sm:flex-row sm:rounded-[18px] sm:border"
      >
        <DialogTitle className="sr-only">{t.settings}</DialogTitle>
        <SettingsBody key={opened.n} initial={opened.tab} />
        <DialogClose
          render={<Button variant="ghost" size="icon-lg" className="absolute right-2 top-2 z-10 sm:right-3 sm:top-3" />}
        >
          <CloseIcon />
          <span className="sr-only">{c.close}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({ initial }: { initial: SettingsTab }) {
  const { user } = useRouteContext({ from: "/app" });
  const visible = tabs.filter((t) => !t.admin || user.role === "admin");
  const [tab, setTab] = useState(visible.some((t) => t.id === initial) ? initial : "general");
  return (
    <>
      <nav className="flex shrink-0 flex-col border-b border-border bg-sidebar pt-3 pr-12 sm:w-[210px] sm:border-r sm:border-b-0 sm:pr-0">
        <SettingsNav tabs={visible} tab={tab} onSelect={setTab} />
      </nav>
      <SettingsContent tab={tab} />
    </>
  );
}

/** The settings' navigation (Figma « Navigation »): a search, then the tabs in their groups, grey icons. */
function SettingsNav({ tabs: visible, tab, onSelect }: { tabs: typeof tabs; tab: SettingsTab; onSelect: (tab: SettingsTab) => void }) {
  const m = useT(messages);
  const [q, setQ] = useState("");
  const shown = visible.filter((x) => m.tabs[x.id].toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2">
      <InputGroup className="mb-1 h-8 shrink-0 rounded-full bg-background">
        <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={useT(common).search} aria-label={m.search} />
        <InputGroupAddon className="text-subtle [&>svg:not([class*='size-'])]:size-[15px]">
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {!shown.length && <p className="px-2 py-4 text-[13px] text-muted-foreground">{m.noMatch}</p>}
        {(["account", "organization", "instance"] as Group[]).map((group) => {
          const items = shown.filter((x) => x.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="flex flex-col gap-px">
              <p className="px-2 pt-4 pb-1.5 text-[13px] leading-[18px] tracking-[-0.05px] text-subtle">{m.groups[group]}</p>
              {items.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-current={tab === x.id ? "page" : undefined}
                  onClick={() => onSelect(x.id)}
                  className={cn(
                    "flex h-[34px] items-center gap-2.5 rounded-[10px] px-2.5 text-left text-sm outline-none transition-colors hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/30 dark:hover:bg-white/5",
                    tab === x.id && "bg-accent hover:bg-accent dark:hover:bg-accent",
                  )}
                >
                  <x.icon className="size-4 shrink-0 text-icon" />
                  <span className="truncate">{m.tabs[x.id]}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The open tab, in a centred column; the memory graph fills the pane instead of scrolling it. */
function SettingsContent({ tab }: { tab: SettingsTab }) {
  return (
    <div className={cn("settings-page h-full min-h-0 flex-1 overflow-y-auto", tab === "memory" && "flex flex-col")}>
      <div className={cn("mx-auto px-5 pt-6 sm:px-10 sm:pt-9", tab === "memory" ? "flex w-full flex-1 flex-col pb-5 sm:pb-8" : "max-w-[700px] pb-12")}>
        <RestartProvider>
          {tab === "general" && <General />}
          {tab === "security" && <Security />}
          {tab === "availability" && <Availability />}
          {tab === "appearance" && <Appearance />}
          {tab === "mobile" && <Mobile />}
          {tab === "organization" && <Organization />}
          {tab === "users" && <Users />}
          {tab === "agents" && <Agents />}
          {tab === "access" && <Access />}
          {tab === "vault" && <Vault />}
          {tab === "integrations" && <AppIntegrations />}
          {tab === "models" && <Models />}
          {tab === "usage" && (
            <Suspense fallback={<Loading />}>
              <Usage />
            </Suspense>
          )}
          {tab === "status" && <Status />}
          {tab === "server" && (
            <Suspense fallback={<Loading />}>
              <Server />
            </Suspense>
          )}
          {tab === "updates" && <Updates />}
          {tab === "memory" && <WikiMemory />}
          {tab === "digest" && <DigestSettings />}
        </RestartProvider>
      </div>
    </div>
  );
}

function General() {
  const { user } = useRouteContext({ from: "/app" });
  const navigate = useNavigate();
  const t = useT(messages);

  return (
    <>
      <SectionHeader title={t.tabs.general} />
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t.profile}</FieldLegend>
          <ProfileEditor />
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>{t.account}</FieldLegend>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{user.email}</ItemTitle>
              <ItemDescription>{user.role === "admin" ? t.admin : t.member}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await authClient.signOut();
                  closeSettings();
                  navigate({ to: "/login" });
                }}
              >
                {t.signOut}
              </Button>
            </ItemActions>
          </Item>
        </FieldSet>
      </FieldGroup>
    </>
  );
}

function Security() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.tabs.security} />
      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t.yourAccount}</FieldLegend>
          <TwoFactor />
        </FieldSet>
        {user.role === "admin" && (
          <>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>{t.organization}</FieldLegend>
              <RequireTwoFactor />
              <NewBotsAllTools />
            </FieldSet>
          </>
        )}
      </FieldGroup>
    </>
  );
}

function Mobile() {
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.tabs.mobile} />
      <MobileApp />
    </>
  );
}

function Organization() {
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.tabs.organization} />
      <OrgSettings />
    </>
  );
}

function Availability() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.tabs.availability} text={t.availabilityHelp} />
      <AvailabilityEditor userId={user.id} self />
    </>
  );
}

function ProfileEditor() {
  const { user } = useRouteContext({ from: "/app" });
  const router = useRouter();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<AvatarChange>(undefined);
  const t = useT(messages);
  const c = useT(common);
  const save = useMutation({
    mutationFn: async (profile: ProfileInput) => {
      await api("/me", { method: "PATCH", body: JSON.stringify(profile) });
      if (photo) await uploadAvatar(photo);
      else if (photo === null) await api("/me/avatar", { method: "DELETE" });
    },
    onSuccess: async () => {
      setPhoto(undefined);
      // The session (route context) carries the profile: refetch it.
      await router.invalidate();
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    meta: { success: t.profileSaved },
  });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(readProfile(new FormData(e.currentTarget)));
      }}
    >
      <AvatarField
        id={user.id}
        name={user.name}
        current={user.image ?? null}
        value={photo}
        onChange={setPhoto}
      />
      <ProfileFields
        idPrefix="profile"
        defaults={{ firstName: user.firstName ?? "", lastName: user.lastName ?? "", title: user.title ?? "", username: user.username ?? "", bio: user.bio ?? "" }}
      />
      <Field orientation="horizontal">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
      </Field>
    </form>
  );
}
