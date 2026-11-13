import { useState, type ReactNode } from "react";
import { CloseIcon, HashIcon, LinkIcon, MailIcon, MapPinIcon, PhoneIcon, UserIcon, VideoIcon } from "@/components/icons";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

/*
 * Inputs by what they hold (an address, a place, a link, a number, a channel, a person), each with
 * its mark and the right keyboard, rather than one text field for everything. shadcn's InputGroup.
 */

const messages = defineMessages({
  en: { remove: (v: string) => `Remove ${v}`, addEmail: "Add an address…" },
  fr: { remove: (v: string) => `Retirer ${v}`, addEmail: "Ajouter une adresse…" },
});

type Base = { id?: string; value?: string; onChange: (v: string) => void; readOnly?: boolean; placeholder?: string; className?: string };

function Marked({ icon, type, inputMode, autoComplete, ...p }: Base & { icon: ReactNode; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoComplete?: string }) {
  return (
    <InputGroup className={p.className}>
      <InputGroupAddon className="text-muted-foreground">{icon}</InputGroupAddon>
      <InputGroupInput
        id={p.id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={p.value ?? ""}
        readOnly={p.readOnly}
        placeholder={p.placeholder}
        onChange={(e) => p.onChange(e.target.value)}
      />
    </InputGroup>
  );
}

/** A meeting link or app (Meet, Zoom, Teams, a URL) reads as a call, anything else as a place. */
const isCall = (v?: string) => !!v && /^(https?:\/\/|meet\b|google meet|zoom|teams|whereby|visio)/i.test(v.trim());

/** A place: a pin; a call (Meet, Zoom, a link): a camera. */
export function LocationInput(p: Base) {
  return <Marked {...p} icon={isCall(p.value) ? <VideoIcon /> : <MapPinIcon />} autoComplete="off" />;
}

/** A web address: a link mark, the URL keyboard. */
export function UrlInput(p: Base) {
  return <Marked {...p} icon={<LinkIcon />} type="url" inputMode="url" autoComplete="url" />;
}

/** A phone number: a handset, the dialling keyboard. */
export function PhoneInput(p: Base) {
  return <Marked {...p} icon={<PhoneIcon />} type="tel" inputMode="tel" autoComplete="tel" />;
}

/** A channel (Slack, Teams): its hash. */
export function ChannelInput(p: Base) {
  return <Marked {...p} value={p.value?.replace(/^#/, "")} onChange={(v) => p.onChange(v.replace(/^#/, ""))} icon={<HashIcon />} autoComplete="off" />;
}

/** A person (an assignee): a face mark. */
export function PersonInput(p: Base) {
  return <Marked {...p} icon={<UserIcon />} autoComplete="name" />;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Email addresses as chips (Gmail's « À »): typed, an address becomes a chip on Enter, a comma, a
 * space or leaving the field; Backspace in the empty field takes the last one back. Invalid ones in red.
 */
export function EmailsInput({ id, value, onChange, readOnly, className }: { id?: string; value: string[]; onChange: (v: string[]) => void; readOnly?: boolean; className?: string }) {
  const t = useT(messages);
  const [draft, setDraft] = useState("");
  const commit = (text = draft) => {
    const added = text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (added.length) onChange([...value, ...added.filter((a) => !value.includes(a))]);
    setDraft("");
  };
  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-ui shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <MailIcon className="size-4 shrink-0 text-muted-foreground" />
      {value.map((a) => (
        <span
          key={a}
          className={cn("flex h-6 items-center gap-1 rounded-md bg-accent pr-1 pl-2 text-ui", !EMAIL.test(a) && "bg-destructive/15 text-destructive")}
        >
          {a}
          {!readOnly && (
            <button type="button" aria-label={t.remove(a)} onClick={() => onChange(value.filter((x) => x !== a))} className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground">
              <CloseIcon className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={draft}
          placeholder={value.length ? undefined : t.addEmail}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\s]$/.test(v)) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => commit()}
          onPaste={(e) => {
            e.preventDefault();
            commit(draft + e.clipboardData.getData("text"));
          }}
          className="min-w-32 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  );
}
