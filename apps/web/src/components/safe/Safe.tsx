import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { VAULT_ITEM_KINDS, type VaultItem, type VaultItemKind, type VaultSummary } from "@agora/core";
import { SectionHeader } from "@/components/admin/ui";
import { ChevronRightIcon, FinanceIntegrationIcon, KeyIcon, LockIcon, MoreIcon, PlusIcon, SearchIcon, SettingsIcon, UserIcon, UsersIcon, type IconComponent } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { vaultItemsQuery, vaultsQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { ItemDialog } from "./ItemDialog";
import { ItemFormDialog } from "./ItemForm";
import { ItemLogo, safeMessages, useItemSubtitle, useVaultName } from "./shared";
import { VaultDialog } from "./VaultDialog";

const messages = defineMessages({
  en: {
    title: "Vault",
    text: "Your logins, payment cards and contact details, for you and the bots you allow.",
    vault: "Vault",
    vaultActions: "Vault actions",
    settings: "Vault settings",
    newShared: "New shared vault",
    search: "Search the vault",
    filter: "Kinds of items",
    noMatch: "No item matches.",
    emptyTitle: "Nothing in this vault yet",
    emptyText: "Add a login, a payment card or contact details: the bots you allow use them to act for you.",
    unreachable: "The vault is unreachable for now.",
    botsNote:
      "Bots never see a card's number or security code. They see logins (with your approval) and contact details, to fill them in for you.",
  },
  fr: {
    title: "Coffre-fort",
    text: "Tes identifiants, cartes de paiement et coordonnées, pour toi et les bots que tu autorises.",
    vault: "Coffre",
    vaultActions: "Actions du coffre",
    settings: "Réglages du coffre",
    newShared: "Nouveau coffre partagé",
    search: "Rechercher dans le coffre",
    filter: "Types d'éléments",
    noMatch: "Aucun élément ne correspond.",
    emptyTitle: "Rien dans ce coffre pour l'instant",
    emptyText: "Ajoute un identifiant, une carte de paiement ou des coordonnées : les bots que tu autorises s'en servent pour agir à ta place.",
    unreachable: "Le coffre est injoignable pour le moment.",
    botsNote:
      "Les bots ne voient jamais le numéro ni le code de sécurité d'une carte. Ils voient les identifiants (sur ton accord) et les coordonnées pour les saisir à ta place.",
  },
});

type Filter = "all" | VaultItemKind;

const KIND_ICON: Record<VaultItemKind, IconComponent> = { login: KeyIcon, card: FinanceIntegrationIcon, contact: UserIcon };

type ItemDialogState = { mode: "view" | "edit"; item: VaultItem } | { mode: "new"; kind: VaultItemKind } | null;

/** Settings › Coffre-fort: the person's vaults, their items, and what bots may read. */
export function Safe() {
  const t = useT(messages);
  const vaultName = useVaultName();
  const vaults = useQuery(vaultsQuery);
  const [picked, setPicked] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<ItemDialogState>(null);
  // undefined: closed; null: a new shared vault.
  const [vaultDialog, setVaultDialog] = useState<VaultSummary | null | undefined>(undefined);
  const list = vaults.data ?? [];
  const vault = list.find((v) => v.id === picked) ?? list[0];
  // An empty vault offers « Nouvel élément » in its empty state only.
  const items = useQuery({ ...vaultItemsQuery(vault?.id ?? ""), enabled: !!vault });

  return (
    <>
      <SectionHeader title={t.title} text={t.text} />
      {vaults.isPending ? (
        <ItemRowsSkeleton />
      ) : vaults.isError || !vault ? (
        <RetryLine text={t.unreachable} error={vaults.error} onRetry={() => void vaults.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {list.length > 1 && (
              <Select items={list.map((v) => ({ value: v.id, label: vaultName(v) }))} value={vault.id} onValueChange={(v) => v && setPicked(v as string)}>
                <SelectTrigger aria-label={t.vault} className="min-w-40">
                  <SelectValue>
                    {(id: string) => {
                      const v = list.find((x) => x.id === id);
                      return v ? (
                        <>
                          {v.kind === "personal" ? <UserIcon /> : <UsersIcon />}
                          {vaultName(v)}
                        </>
                      ) : null;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="start">
                  {list.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.kind === "personal" ? <UserIcon /> : <UsersIcon />}
                      {vaultName(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!!items.data?.length && <NewItemMenu onPick={(kind) => setItemDialog({ mode: "new", kind })} />}
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.vaultActions} />}>
                  <MoreIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {vault.canManage && (
                    <DropdownMenuItem onClick={() => setVaultDialog(vault)}>
                      <SettingsIcon />
                      {t.settings}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setVaultDialog(null)}>
                    <PlusIcon />
                    {t.newShared}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <VaultItems key={vault.id} vault={vault} onOpen={(item) => setItemDialog({ mode: "view", item })} onNew={(kind) => setItemDialog({ mode: "new", kind })} />
        </>
      )}

      <Dialog open={!!itemDialog} onOpenChange={(open) => !open && setItemDialog(null)}>
        {itemDialog && vault && (
          <ItemDialogBody
            key={itemDialog.mode === "new" ? `new-${itemDialog.kind}` : `${itemDialog.mode}-${itemDialog.item.id}`}
            vaultId={vault.id}
            state={itemDialog}
            onChange={setItemDialog}
          />
        )}
      </Dialog>
      <Dialog open={vaultDialog !== undefined} onOpenChange={(open) => !open && setVaultDialog(undefined)}>
        {vaultDialog !== undefined && (
          <VaultDialog
            key={vaultDialog?.id ?? "new"}
            vault={vaultDialog ?? undefined}
            onDone={(saved) => {
              setPicked(saved?.id ?? null);
              setVaultDialog(undefined);
            }}
            onDeleted={() => {
              setPicked(null);
              setVaultDialog(undefined);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

/** The open item: shown, edited, or a new one of a kind. */
function ItemDialogBody({ vaultId, state, onChange }: { vaultId: string; state: NonNullable<ItemDialogState>; onChange: (next: ItemDialogState) => void }) {
  const { data: items } = useQuery(vaultItemsQuery(vaultId));
  if (state.mode === "new") return <ItemFormDialog vaultId={vaultId} kind={state.kind} onDone={() => onChange(null)} />;
  // The list's copy once refetched, so an edit shows up.
  const item = items?.find((i) => i.id === state.item.id) ?? state.item;
  if (state.mode === "edit") return <ItemFormDialog vaultId={vaultId} kind={item.kind} item={item} onDone={(saved) => onChange({ mode: "view", item: saved })} />;
  return <ItemDialog vaultId={vaultId} item={item} onEdit={() => onChange({ mode: "edit", item })} onRemoved={() => onChange(null)} />;
}

/** « Nouvel élément »: the three kinds of items. */
function NewItemMenu({ onPick, variant }: { onPick: (kind: VaultItemKind) => void; variant?: "default" | "outline" }) {
  const s = useT(safeMessages);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant={variant ?? "default"} />}>{s.newItem}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {VAULT_ITEM_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <DropdownMenuItem key={kind} onClick={() => onPick(kind)}>
              <Icon />
              {s.kinds[kind]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A vault's items: search, kinds with their counts, the rows on one grey surface, what bots see. */
function VaultItems({ vault, onOpen, onNew }: { vault: VaultSummary; onOpen: (item: VaultItem) => void; onNew: (kind: VaultItemKind) => void }) {
  const t = useT(messages);
  const s = useT(safeMessages);
  const c = useT(common);
  const subtitle = useItemSubtitle();
  const items = useQuery(vaultItemsQuery(vault.id));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  if (items.isPending) return <ItemRowsSkeleton />;
  if (items.isError) return <RetryLine text={t.unreachable} error={items.error} onRetry={() => void items.refetch()} />;

  const all = items.data;
  if (!all.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.emptyText}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <NewItemMenu onPick={onNew} variant="outline" />
        </EmptyContent>
      </Empty>
    );

  const count = (f: Filter) => (f === "all" ? all.length : all.filter((i) => i.kind === f).length);
  const q = query.trim().toLowerCase();
  const shown = all
    .filter((i) => filter === "all" || i.kind === filter)
    .filter((i) => !q || [i.title, i.website ?? "", ...Object.values(i.fields)].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-3">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.search} aria-label={t.search} />
      </InputGroup>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList aria-label={t.filter} className="max-w-full overflow-x-auto">
          {(["all", ...VAULT_ITEM_KINDS] as Filter[]).map((f) => (
            <TabsTrigger key={f} value={f}>
              {s.tabs[f]}
              <Badge variant="secondary">{count(f)}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {shown.length ? (
        <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-muted/50 has-data-[size=sm]:gap-0">
          {shown.map((item, i) => (
            <Fragment key={item.id}>
              {i > 0 && <ItemSeparator className="my-0" />}
              <Item size="sm" className="cursor-pointer rounded-none text-left hover:bg-muted" render={<button type="button" onClick={() => onOpen(item)} />}>
                <ItemLogo item={item} className="size-8" />
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate">{item.title}</ItemTitle>
                  {subtitle(item) && <ItemDescription className="truncate">{subtitle(item)}</ItemDescription>}
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{t.noMatch}</p>
      )}
      <p className="text-sm text-muted-foreground">{t.botsNote}</p>
    </div>
  );
}

function ItemRowsSkeleton() {
  return (
    <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-muted/50 has-data-[size=sm]:gap-0">
      {[0, 1, 2].map((i) => (
        <Fragment key={i}>
          {i > 0 && <ItemSeparator className="my-0" />}
          <Item size="sm" className="rounded-none">
            <ItemMedia>
              <Skeleton className="size-8 rounded-sm" />
            </ItemMedia>
            <ItemContent className="gap-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </ItemContent>
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}

/** Data that couldn't be fetched: one muted line, the cause in a tooltip, and a way to try again. */
function RetryLine({ text, error, onRetry }: { text: string; error: unknown; onRetry: () => void }) {
  const c = useT(common);
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" title={error instanceof Error ? error.message : undefined}>
      {text}
      <Button variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
        {c.retry}
      </Button>
    </p>
  );
}
