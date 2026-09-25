import { envFileValue, fileMatchesAccept, mcpEnvAccept, mcpEnvInput, MCP_ENV_VALUE_MAX, type McpEnvField } from "@agora/core";
import { useRef, useState } from "react";
import { RequiredMark } from "@/components/FormLabel";
import { FileTextIcon } from "@/components/icons";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    chooseFile: "Choose a file",
    fileTooBig: "This file is too large (32 KB max).",
    fileType: "This file type isn't accepted.",
    unreadable: "This file can't be read.",
    choose: "Choose",
    requiredValue: "Required.",
  },
  fr: {
    chooseFile: "Choisir un fichier",
    fileTooBig: "Ce fichier est trop lourd (32 Ko max).",
    fileType: "Ce type de fichier n'est pas accepté.",
    unreadable: "Ce fichier ne peut pas être lu.",
    choose: "Choisir",
    requiredValue: "Obligatoire.",
  },
});

/** One configuration field of a connector: text, masked value, long text, file or list. */
export function ConnectorField({
  id,
  field,
  value,
  fileName,
  invalid,
  onChange,
  className,
}: {
  id: string;
  field: McpEnvField;
  value: string;
  fileName?: string;
  invalid?: boolean;
  /** `fileName` is set when the value comes from a picked file, so the form shows the name and not the contents. */
  onChange: (value: string, fileName?: string) => void;
  className?: string;
}) {
  const t = useT(messages);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = mcpEnvInput(field);
  const accept = mcpEnvAccept(field);
  const control = "bg-background font-mono dark:bg-background";

  const pick = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    if (!fileMatchesAccept(file.name, file.type, accept)) {
      setFileError(t.fileType);
      return;
    }
    if (file.size > MCP_ENV_VALUE_MAX) {
      setFileError(t.fileTooBig);
      return;
    }
    try {
      const text = envFileValue(await file.text());
      if (text.length > MCP_ENV_VALUE_MAX) {
        setFileError(t.fileTooBig);
        return;
      }
      setFileError(null);
      onChange(text, file.name);
    } catch {
      setFileError(t.unreadable);
    }
  };

  return (
    <Field className={cn("gap-1.5", className)} data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id} className="font-mono text-xs">
        {field.name}
        {field.required && <RequiredMark />}
      </FieldLabel>
      {input === "file" ? (
        <>
          <button
            type="button"
            id={id}
            aria-invalid={invalid || undefined}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm outline-none focus-visible:border-ring",
              fileName ? "text-foreground" : "text-muted-foreground",
              (invalid || fileError) && "border-destructive/50",
            )}
          >
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{fileName || t.chooseFile}</span>
          </button>
          <input ref={fileRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files)} />
        </>
      ) : input === "select" ? (
        <Select items={(field.options ?? []).map((o) => ({ value: o, label: o }))} value={value || null} onValueChange={(v) => onChange(v ?? "")}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn(control, "w-full px-3 data-[size=default]:h-10 dark:hover:bg-background")}>
            <SelectValue placeholder={field.placeholder || t.choose} />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : input === "textarea" ? (
        <Textarea
          id={id}
          required={field.required}
          value={value}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          rows={4}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          className={cn(control, "font-mono")}
        />
      ) : (
        <Input
          id={id}
          required={field.required}
          type={input === "secret" ? "password" : "text"}
          value={value}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={control}
        />
      )}
      {field.description && <FieldDescription className="text-xs">{field.description}</FieldDescription>}
      {(fileError || (invalid && input !== "text" && input !== "secret" && input !== "textarea" && !value)) && (
        <FieldDescription className="text-xs text-destructive">{fileError ?? t.requiredValue}</FieldDescription>
      )}
    </Field>
  );
}
