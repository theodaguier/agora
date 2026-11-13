import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useRouter } from "@tanstack/react-router";
import { BotIcon, BuildingIcon, CodeIcon, CalendarClockIcon, FileTextIcon, CheckCircleIcon, LayersIcon, PaletteIcon, BrainIcon, ChartIcon, KeyIcon, LockIcon, MonitorIcon, RefreshIcon, PlugIcon, ServerIcon, SlidersIcon, ShieldCheckIcon, SmartphoneIcon, UsersIcon, CloseIcon, SearchIcon, type IconComponent, ChevronLeftIcon } from "@/components/icons";
import { lazy, Suspense, useEffect, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useDesktop } from "@/lib/workspace";
import { Access } from "@/components/admin/Access";
import { AppIntegrations } from "@/components/admin/AppIntegrations";
import { Agents } from "@/components/admin/Agents";
import { Models } from "@/components/admin/Models";
import { OrgSettings } from "@/components/admin/OrgSettings";
import { Loading, RestartProvider, SectionHeader, SettingsGroup, SettingsRow } from "@/components/admin/ui";
import { NewBotsAllTools, RequireTwoFactor } from "@/components/admin/Security";
import { Status } from "@/components/admin/Status";
import { Updates } from "@/components/admin/Updates";
import { Users } from "@/components/admin/Users";
import { Vault } from "@/components/admin/Vault";
import { Machines } from "@/components/admin/Machines";
import { Safe } from "@/components/safe/Safe";
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
  { id: "safe", icon: LockIcon, group: "account" },
  { id: "appearance", icon: PaletteIcon, group: "account" },
  { id: "mobile", icon: SmartphoneIcon, group: "account" },
  { id: "usage", icon: ChartIcon, group: "account" },
  { id: "organization", icon: BuildingIcon, group: "organization", admin: true },
  { id: "users", icon: UsersIcon, group: "organization", admin: true },
  { id: "agents", icon: BotIcon, group: "organization", admin: true },
  { id: "access", icon: KeyIcon, group: "organization", admin: true },
  { id: "integrations", icon: PlugIcon, group: "organization", admin: true },
  { id: "models", icon: LayersIcon, group: "organization", admin: true },
  { id: "memory", icon: BrainIcon, group: "organization", admin: true },
  { id: "digest", icon: FileTextIcon, group: "organization", admin: true },
  { id: "status", icon: CheckCircleIcon, group: "instance", admin: true },
  { id: "server", icon: ServerIcon, group: "instance", admin: true },
  { id: "machines", icon: MonitorIcon, group: "instance", admin: true },
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
      safe: "Vault",
      vault: "Technical secrets",
      integrations: "Integrations",
      models: "Models",
      memory: "Memory",
      digest: "Recaps",
      usage: "Usage",
      status: "Status",
      server: "Server",
      machines: "SSH machines",
      updates: "Updates",
    } as Record<SettingsTab, string>,
    profile: "Profile",
    generalHelp: "Your profile, as colleagues and bots see it.",
    account: "Account",
    email: "Email",
    orgRole: "Role in the organization",
    signOutHere: "Sign out of this device",
    groups: { account: "Account", organization: "Organization", instance: "Instance" } as Record<Group, string>,
    search: "Search settings",
    backToApp: "Back to app",
    noMatch: "No setting matches.",
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
      safe: "Coffre-fort",
      vault: "Secrets techniques",
      integrations: "Intégrations",
      models: "Modèles",
      memory: "Mémoire",
      digest: "Récaps",
      usage: "Consommation",
      status: "Statut",
      server: "Serveur",
      machines: "Machines SSH",
      updates: "Mises à jour",
    },
    profile: "Profil",
    generalHelp: "Ton profil, visible par tes collègues et les bots.",
    account: "Compte",
    email: "E-mail",
    orgRole: "Rôle dans l'organisation",
    signOutHere: "Se déconnecter de cet appareil",
    groups: { account: "Compte", organization: "Organisation", instance: "Instance" },
    search: "Rechercher un réglage",
    backToApp: "Retour à l'app",
    noMatch: "Aucun réglage ne correspond.",
    admin: "Admin",
    member: "Membre",
    signOut: "Se déconnecter",
    profileSaved: "Profil enregistré.",
    availabilityHelp: "Tes collègues et les bots voient quand tu es absent·e ou hors de tes horaires : ils sont prévenus avant de t'écrire, et les bots évitent de te solliciter.",
  },
});

/**
 * The settings: a modal over the app, its navigation on the left (on top on a phone). Mounted once in AppShell; opened via openSettings().
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
        // Opened with the mouse, nothing is focused: no ring around the search before you type.
        initialFocus={(type) => type === "keyboard"}
        // Desktop: a page over the app, as Linear's: the navigation where the sidebar is, the tab in the same inset panel.
        className="flex h-dvh flex-col gap-0 overflow-hidden p-0 sm:top-0 sm:left-0 sm:h-dvh sm:max-h-none sm:w-full sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:flex-row sm:rounded-none sm:bg-sidebar sm:ring-0"
      >
        <DialogTitle className="sr-only">{t.settings}</DialogTitle>
        <SettingsBody key={opened.n} initial={opened.tab} />
        <DialogClose
          render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 sm:hidden" />}
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
  // The technical secrets live in the Coffre-fort now: a link to them opens it.
  const wanted = initial === "vault" ? "safe" : initial;
  const [tab, setTab] = useState<SettingsTab>(visible.some((t) => t.id === wanted) ? wanted : "general");
  return (
    <>
      {/* Figma « Réglages »: the navigation on the sidebar's ground, a hairline, then the tab. */}
      <nav className="flex max-h-60 shrink-0 flex-col border-b bg-sidebar px-3 pt-3.5 pb-3 pr-12 sm:max-h-none sm:w-60 sm:border-b-0 sm:pr-3">
        <SettingsNav tabs={visible} tab={tab} onSelect={setTab} />
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 bg-background sm:my-2 sm:mr-2 sm:overflow-hidden sm:rounded-lg sm:border">
        <SettingsContent tab={tab} />
      </div>
    </>
  );
}

/** The settings' navigation: a search, then the tabs in their groups. */
function SettingsNav({ tabs: visible, tab, onSelect }: { tabs: typeof tabs; tab: SettingsTab; onSelect: (tab: SettingsTab) => void }) {
  const m = useT(messages);
  const [q, setQ] = useState("");
  const shown = visible.filter((x) => m.tabs[x.id].toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <DialogClose
        render={<Button variant="ghost" className="hidden h-9 w-full justify-start gap-2 px-2 text-ui font-medium sm:flex" />}
      >
        <ChevronLeftIcon className="text-muted-foreground" />
        {m.backToApp}
      </DialogClose>
      <InputGroup className="h-8 shrink-0 bg-transparent text-ui dark:bg-transparent">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={useT(common).search} aria-label={m.search} />
      </InputGroup>
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto">
        {!shown.length && <p className="px-2 py-4 text-ui text-muted-foreground">{m.noMatch}</p>}
        {(["account", "organization", "instance"] as Group[]).map((group) => {
          const items = shown.filter((x) => x.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="flex flex-col gap-px">
              <p className="px-2 pb-1 text-xs leading-4.25 text-muted-foreground">{m.groups[group]}</p>
              {items.map((x) => (
                <Button
                  key={x.id}
                  variant={tab === x.id ? "secondary" : "ghost"}
                  aria-current={tab === x.id ? "page" : undefined}
                  onClick={() => onSelect(x.id)}
                  className={cn("h-7.5 w-full justify-start gap-2.5 px-2 text-ui font-normal", tab !== x.id && "text-sidebar-foreground")}
                >
                  <x.icon />
                  <span className="truncate">{m.tabs[x.id]}</span>
                </Button>
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
  const { user } = useRouteContext({ from: "/app" });
  const isAdmin = user.role === "admin";
  return (
    <div className={cn("h-full min-h-0 flex-1 overflow-y-auto", tab === "memory" && "flex flex-col")}>
      <div className={cn("mx-auto px-4 pt-6 sm:px-10 sm:pt-16", tab === "memory" ? "flex w-full flex-1 flex-col" : "flex max-w-2xl flex-col gap-8 pb-16")}>
        <RestartProvider>
          {/* Each tab: its header, then its cards (shadcn Card), one gap between them. */}
          {tab === "general" && <General />}
          {tab === "security" && <Security />}
          {tab === "availability" && <Availability />}
          {tab === "appearance" && <Appearance />}
          {tab === "mobile" && <Mobile />}
          {tab === "organization" && <Organization />}
          {tab === "users" && <Users />}
          {tab === "agents" && <Agents />}
          {tab === "access" && <Access />}
          {/* Everything secret in one place: yours, then (admins) the organization's technical secrets. */}
          {tab === "safe" && (
            <>
              <Safe />
              {isAdmin && <Vault embedded />}
            </>
          )}
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
          {tab === "machines" && <Machines />}
          {tab === "memory" && <WikiMemory />}
          {tab === "digest" && <DigestSettings />}
        </RestartProvider>
      </div>
    </div>
  );
}

/** Figma « R1 · Réglages — Général », laid out as Linear's: the profile, then the account, each one group of rows. */
function General() {
  const { user } = useRouteContext({ from: "/app" });
  const navigate = useNavigate();
  const t = useT(messages);

  return (
    <>
      <SectionHeader title={t.tabs.general} text={t.generalHelp} />
      <ProfileEditor />
      <SettingsGroup title={t.account}>
        <SettingsRow label={t.email}>
          <span className="truncate text-muted-foreground">{user.email}</span>
        </SettingsRow>
        <SettingsRow label={t.orgRole}>
          <span className="text-muted-foreground">{user.role === "admin" ? t.admin : t.member}</span>
        </SettingsRow>
        <SettingsRow label={t.signOutHere}>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await authClient.signOut();
              closeSettings();
              navigate({ to: "/login" });
            }}
          >
            {t.signOut}
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function Security() {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  return (
    <>
      <SectionHeader title={t.tabs.security} />
      <TwoFactor />
      {user.role === "admin" && (
        <>
          <RequireTwoFactor />
          <NewBotsAllTools />
        </>
      )}
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
  // Uncontrolled fields: any edit marks the form changed until it's saved.
  const [edited, setEdited] = useState(false);
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
      setEdited(false);
      // The session (route context) carries the profile: refetch it.
      await router.invalidate();
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    meta: { success: t.profileSaved },
  });
  const dirty = edited || photo !== undefined;

  return (
    <form
      onChange={() => setEdited(true)}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(readProfile(new FormData(e.currentTarget)));
      }}
    >
      <SettingsGroup
        title={t.profile}
        footer={
          // Saved on demand: the button only shows once something changed.
          dirty && (
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? c.saving : c.save}
              </Button>
            </div>
          )
        }
      >
        <div className="px-4 py-3">
          <AvatarField id={user.id} name={user.name} current={user.image ?? null} value={photo} onChange={setPhoto} />
        </div>
        <ProfileFields
          rows
          idPrefix="profile"
          defaults={{ firstName: user.firstName ?? "", lastName: user.lastName ?? "", title: user.title ?? "", username: user.username ?? "", bio: user.bio ?? "" }}
        />
      </SettingsGroup>
    </form>
  );
}
