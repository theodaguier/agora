import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArchiveIcon, CheckIcon, ChevronDownIcon, FolderIcon, LinkIcon, MoreIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { ProjectStatusIcon, useProjectStatusLabel } from "@/components/ProjectMarks";
import { PROJECT_STATUSES, type ProjectStatus } from "@agora/core";
import { toast } from "sonner";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { api, conversationPath, type ConversationSummary } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { conversationQuery, conversationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { tabPath } from "@/lib/workspace";

const messages = defineMessages({
  en: {
    general: "General",
    seeAll: (n: number) => `See all (${n})`,
    newDiscussion: "New discussion",
    discussionName: "Discussion name",
    create: "Create",
    rename: "Rename",
    renameTitle: "Rename the discussion",
    pin: "Pin",
    unpin: "Unpin",
    move: "Move to a project",
    markRead: "Mark as read",
    archive: "Archive",
    unarchive: "Restore",
    delete: "Delete",
    actions: (name: string) => `Actions for ${name}`,
    projectActions: (name: string) => `Actions for the project ${name}`,
    fold: (name: string) => `Fold ${name}`,
    unfold: (name: string) => `Unfold ${name}`,
    openProject: "Open the project",
    status: "Status",
    copyLink: "Copy the link",
    linkCopied: "Link copied.",
    addDiscussion: (name: string) => `New discussion in ${name}`,
    deleteTitle: (name: string) => `Delete « ${name} »?`,
    deleteBody: "Its messages are deleted for every member. This can't be undone.",
    deleted: "Discussion deleted.",
    archived: "Discussion archived.",
    restored: "Discussion restored.",
    moved: "Discussion moved.",
    failed: "Action failed.",
    createFailed: "Couldn't create the discussion.",
  },
  fr: {
    general: "Général",
    seeAll: (n: number) => `Voir tout (${n})`,
    newDiscussion: "Nouvelle discussion",
    discussionName: "Nom de la discussion",
    create: "Créer",
    rename: "Renommer",
    renameTitle: "Renommer la discussion",
    pin: "Épingler",
    unpin: "Désépingler",
    move: "Déplacer vers un projet",
    markRead: "Marquer comme lu",
    archive: "Archiver",
    unarchive: "Restaurer",
    delete: "Supprimer",
    actions: (name: string) => `Actions sur ${name}`,
    projectActions: (name: string) => `Actions sur le projet ${name}`,
    fold: (name: string) => `Replier ${name}`,
    unfold: (name: string) => `Déplier ${name}`,
    openProject: "Ouvrir le projet",
    status: "Statut",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié.",
    addDiscussion: (name: string) => `Nouvelle discussion dans ${name}`,
    deleteTitle: (name: string) => `Supprimer « ${name} » ?`,
    deleteBody: "Ses messages sont supprimés pour tous les membres. Impossible de revenir en arrière.",
    deleted: "Discussion supprimée.",
    archived: "Discussion archivée.",
    restored: "Discussion restaurée.",
    moved: "Discussion déplacée.",
    failed: "Action impossible.",
    createFailed: "Impossible de créer la discussion.",
  },
});

/** In the sidebar, a project shows « General » and this many of its discussions: the pinned ones, then the latest. */
export const SIDEBAR_DISCUSSIONS = 4;

type Named = ConversationSummary & { name: string };

/** A project's discussions still in use, pinned first, then by last activity (the list comes most recent first). */
export function activeDiscussions(all: Named[], projectId: string) {
  const mine = all.filter((c) => c.parentId === projectId && !c.archived);
  return [...mine.filter((c) => c.pinned), ...mine.filter((c) => !c.pinned)];
}

const OPEN_KEY = "sidebar:projects-open";

/** The projects unfolded in the sidebar, remembered in this browser (a convenience: nothing breaks without it). */
export function useOpenProjects(): [Set<string>, (id: string, open?: boolean) => void] {
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (id: string, next?: boolean) =>
    setOpen((prev) => {
      const set = new Set(prev);
      if (next ?? !set.has(id)) set.add(id);
      else set.delete(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...set]));
      } catch {
        // Storage blocked: the fold lasts until the page reloads.
      }
      return set;
    });
  return [open, toggle];
}

/**
 * A project as a folder: its row unfolds « General » (the project's own thread) and its latest discussions,
 * then « See all » once there are more. The « + » on hover opens a new discussion in it.
 */
export function ProjectItem({
  project,
  discussions,
  projects,
  me,
  activeId,
  open,
  onToggle,
  desktop,
  all = false,
}: {
  project: Named;
  discussions: Named[];
  projects: Named[];
  me: string;
  activeId: string | undefined;
  open: boolean;
  onToggle: () => void;
  desktop: boolean;
  /** Every discussion given, not only the latest (a search's matches). */
  all?: boolean;
}) {
  const t = useT(messages);
  const create = useCreateDiscussion();
  const page = useLocation({ select: (l) => l.pathname === `/p/${project.id}` });
  const shown = all ? discussions : discussions.slice(0, SIDEBAR_DISCUSSIONS);
  // Unread somewhere inside a folded project: the dot stays on its row.
  const unread = !open && [project, ...discussions].some((c) => c.unread && c.id !== activeId);
  return (
    <>
      <SidebarMenuItem>
        {/* The name opens the project's page; the fold is its own button over the logo (on hover on desktop). */}
        <SidebarMenuButton
          size={desktop ? "default" : "lg"}
          className={desktop ? "h-7.5 gap-2.5 text-ui" : undefined}
          isActive={page}
          render={<Link to="/p/$projectId" params={{ projectId: project.id }} aria-current={page ? "page" : undefined} />}
        >
          <ConversationAvatar
            conversation={project}
            me={me}
            className={cn(desktop ? "size-4 group-hover/menu-item:opacity-0 group-has-[[data-fold]:focus-visible]/menu-item:opacity-0" : "size-7 opacity-0")}
          />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {unread && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
        </SidebarMenuButton>
        <button
          type="button"
          data-fold
          aria-expanded={open}
          aria-label={open ? t.fold(project.name) : t.unfold(project.name)}
          onClick={onToggle}
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            desktop ? "left-2 size-4 opacity-0 group-hover/menu-item:opacity-100 focus-visible:opacity-100" : "left-2 size-7",
          )}
        >
          <ChevronDownIcon className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
        </button>
        <ProjectMenu project={project} trigger={<SidebarMenuAction showOnHover aria-label={t.projectActions(project.name)} className="right-7" />} />
        <SidebarMenuAction showOnHover aria-label={t.addDiscussion(project.name)} disabled={create.isPending} onClick={() => create.mutate(project.id)}>
          <PlusIcon />
        </SidebarMenuAction>
      </SidebarMenuItem>
      {open && (
        <li>
          <SidebarMenuSub>
            <SidebarMenuItem>
              <SidebarMenuSubButton
                isActive={activeId === project.id}
                render={<Link to="/c/$conversationId" params={{ conversationId: project.id }} aria-current={activeId === project.id ? "page" : undefined} />}
              >
                <span className={cn("min-w-0 flex-1 truncate", project.unread && activeId !== project.id && "font-medium")}>{t.general}</span>
              </SidebarMenuSubButton>
            </SidebarMenuItem>
            {shown.map((d) => (
              <DiscussionItem key={d.id} discussion={d} projects={projects} active={activeId === d.id} />
            ))}
            {discussions.length > shown.length && (
              <SidebarMenuItem>
                <SidebarMenuSubButton render={<Link to="/p/$projectId" params={{ projectId: project.id }} search={{ tab: "discussions" }} />} className="text-muted-foreground">
                  <span>{t.seeAll(discussions.length + 1)}</span>
                </SidebarMenuSubButton>
              </SidebarMenuItem>
            )}
          </SidebarMenuSub>
        </li>
      )}
    </>
  );
}

/**
 * A project's quick settings (Figma « réglages rapides »): open its page, a new discussion, its status,
 * its link. In the sidebar on hover and in its page's header.
 */
export function ProjectMenu({ project, trigger, align = "start" }: { project: ConversationSummary; trigger: ReactNode & React.ReactElement; align?: "start" | "end" }) {
  const t = useT(messages);
  const statusLabel = useProjectStatusLabel();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useCreateDiscussion();
  const status = project.status ?? "in_progress";
  const setStatus = useMutation({
    mutationFn: (next: ProjectStatus) => api(conversationPath(project.id), { method: "PATCH", body: JSON.stringify({ status: next }) }),
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }), qc.invalidateQueries({ queryKey: conversationQuery(project.id).queryKey })]),
    meta: { error: t.failed },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => navigate({ to: "/p/$projectId", params: { projectId: project.id } })}>
            <FolderIcon />
            {t.openProject}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={create.isPending} onClick={() => create.mutate(project.id)}>
            <PlusIcon />
            {t.newDiscussion}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ProjectStatusIcon status={status} />
              {t.status}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              {PROJECT_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onClick={() => s !== status && setStatus.mutate(s)}>
                  <ProjectStatusIcon status={s} />
                  {statusLabel[s]}
                  {s === status && <CheckIcon className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            void navigator.clipboard.writeText(new URL(`/p/${project.id}`, window.location.origin).toString()).then(() => toast.success(t.linkCopied))
          }
        >
          <LinkIcon />
          {t.copyLink}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A discussion in its project's folder; its actions on hover. */
function DiscussionItem({ discussion: d, projects, active }: { discussion: Named; projects: Named[]; active: boolean }) {
  const t = useT(messages);
  return (
    <SidebarMenuItem>
      <SidebarMenuSubButton isActive={active} render={<Link to="/c/$conversationId" params={{ conversationId: d.id }} aria-current={active ? "page" : undefined} />}>
        <span className={cn("min-w-0 flex-1 truncate", d.unread && !active && "font-medium")}>{d.name}</span>
      </SidebarMenuSubButton>
      <DiscussionMenu discussion={d} projects={projects} trigger={<SidebarMenuAction showOnHover aria-label={t.actions(d.name)} />} />
    </SidebarMenuItem>
  );
}

/** Rename, pin, move, mark read, archive, delete: the same menu in the sidebar and on the project's page. */
export function DiscussionMenu({ discussion: d, projects, trigger }: { discussion: Named; projects: Named[]; trigger: ReactNode & React.ReactElement }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }), qc.invalidateQueries({ queryKey: conversationQuery(d.id).queryKey })]);
  const patch = useMutation({
    mutationFn: (body: { pinned?: boolean; archived?: boolean; parentId?: string }) => api(conversationPath(d.id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refresh,
    meta: {
      success: (_: unknown, body: { archived?: boolean; parentId?: string }) =>
        body.archived === true ? t.archived : body.archived === false ? t.restored : body.parentId ? t.moved : undefined,
      error: t.failed,
    },
  });
  const read = useMutation({ mutationFn: () => api(conversationPath(d.id, "/read"), { method: "POST" }), onSuccess: refresh, meta: { error: t.failed } });
  const remove = useMutation({
    mutationFn: () => api(conversationPath(d.id), { method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      if (location.pathname.startsWith(tabPath.conversation(d.id))) navigate({ to: "/c/$conversationId", params: { conversationId: d.parentId! } });
    },
    meta: { success: t.deleted, error: t.failed },
  });
  const others = projects.filter((p) => p.id !== d.parentId);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger}>
          <MoreIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <PencilIcon />
              {t.rename}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => patch.mutate({ pinned: !d.pinned })}>
              <PinIcon />
              {d.pinned ? t.unpin : t.pin}
            </DropdownMenuItem>
            {others.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderIcon />
                  {t.move}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {others.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => patch.mutate({ parentId: p.id })}>
                      <FolderIcon />
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuItem disabled={!d.unread} onClick={() => read.mutate()}>
              <CheckIcon />
              {t.markRead}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => patch.mutate({ archived: !d.archived })}>
              <ArchiveIcon />
              {d.archived ? t.unarchive : t.archive}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => (await confirmAction({ title: t.deleteTitle(d.name), description: t.deleteBody, action: t.delete })) && remove.mutate()}
            >
              <TrashIcon />
              {t.delete}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={t.renameTitle}
        initial={d.title ?? ""}
        submit={t.rename}
        onSubmit={async (name) => {
          await api(conversationPath(d.id), { method: "PATCH", body: JSON.stringify({ title: name }) });
          await refresh();
        }}
      />
    </>
  );
}

/** Opens a new discussion in a project, without a name: its bot names it after the first exchange. */
export function useCreateDiscussion() {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (projectId: string) => api<{ id: string }>(conversationPath(projectId, "/discussions"), { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    },
    meta: { error: t.createFailed },
  });
}

/** One required name field in a dialog: a new discussion, or renaming one. */
function NameDialog({
  open,
  onOpenChange,
  title,
  initial,
  submit,
  onSubmit,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  submit: string;
  onSubmit: (name: string) => Promise<void>;
  error?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <NameForm title={title} initial={initial} submit={submit} onSubmit={onSubmit} onDone={() => onOpenChange(false)} error={error} />}
    </Dialog>
  );
}

function NameForm({
  title,
  initial,
  submit,
  onSubmit,
  onDone,
  error,
}: {
  title: string;
  initial: string;
  submit: string;
  onSubmit: (name: string) => Promise<void>;
  onDone: () => void;
  error?: string;
}) {
  const t = useT(messages);
  const c = useT(common);
  const [name, setName] = useState(initial);
  const save = useMutation({ mutationFn: () => onSubmit(name.trim()), onSuccess: onDone, meta: { error: error ?? t.failed } });
  const valid = name.trim().length > 0 && name.trim() !== initial;
  const formId = "discussion-name";
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !save.isPending) save.mutate();
        }}
      >
        <Field>
          <FormLabel htmlFor={`${formId}-input`} required>
            {t.discussionName}
          </FormLabel>
          <Input id={`${formId}-input`} autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form={formId} disabled={!valid || save.isPending}>
          {submit}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
