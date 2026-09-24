import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OrgLogo } from "@/components/OrgLogo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel } from "@/components/FormLabel";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TotpInput } from "@/components/TotpInput";
import { useT } from "@/i18n";
import { auth, common } from "@agora/core/i18n";
import { authClient } from "@/lib/auth";
import { useOrgTitle } from "@/lib/org";

/** better-auth errors come back in English from the library: map them to a localized message by code/status. */
type LoginError = "invalid" | "tooMany" | "unknown";
const loginError = (e: { status?: number; code?: string }): LoginError =>
  e.status === 429 ? "tooMany" : e.status === 401 || e.code?.startsWith("INVALID_") ? "invalid" : e.status && e.status >= 500 ? "unknown" : "invalid";

export function Login() {
  const navigate = useNavigate();
  const t = useT(auth);
  const c = useT(common);
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const orgName = useOrgTitle();

  if (twoFactor) return <TwoFactorStep onBack={() => setTwoFactor(false)} onDone={() => navigate({ to: "/" })} />;

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setPending(true);
          setError(null);
          const { data, error } = await authClient.signIn
            .email({
              email: String(form.get("email")),
              password: String(form.get("password")),
            })
            .finally(() => setPending(false));
          if (error) setError(loginError(error));
          // Two-step sign-in on for this account: no session yet, the code comes next.
          else if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) setTwoFactor(true);
          else navigate({ to: "/" });
        }}
        className="w-full max-w-sm"
      >
        <OrgLogo className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.title(orgName)}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{t.hint}</p>
        <FieldGroup className="mt-3 gap-3">
          <LoginField label={t.email} name="email" type="email" autoComplete="email" placeholder={t.emailPlaceholder} invalid={!!error} />
          <LoginField
            label={t.password}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!error}
          />
        </FieldGroup>
        {error && <FieldError className="mt-3">{error === "unknown" ? c.unknownError : t[error]}</FieldError>}
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? t.signingIn : t.signIn}
        </Button>
        <Button variant="link" nativeButton={false} render={<Link to="/forgot-password" />} className="mx-auto mt-3 flex text-muted-foreground">
          {t.forgot}
        </Button>
      </form>
    </div>
  );
}

type CodeError = "invalidCode" | "expiredChallenge" | "tooMany" | "unknown";
const codeError = (e: { status?: number; code?: string }): CodeError =>
  e.status === 429
    ? "tooMany"
    : e.code === "INVALID_TWO_FACTOR_COOKIE" || e.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
      ? "expiredChallenge"
      : e.status && e.status >= 500
        ? "unknown"
        : "invalidCode";

/** Second step of the sign-in: authenticator code, or one of the backup codes. */
function TwoFactorStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const t = useT(auth);
  const c = useT(common);
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<CodeError | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
          setPending(true);
          setError(null);
          const { error } = await (backup
            ? authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust })
            : authClient.twoFactor.verifyTotp({ code, trustDevice: trust })
          ).finally(() => setPending(false));
          if (error) setError(codeError(error));
          else onDone();
        }}
        className="w-full max-w-sm"
      >
        <OrgLogo className="mx-auto size-14" />
        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight">{t.twoFactorTitle}</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">{backup ? t.backupHint : t.twoFactorHint}</p>
        <FieldGroup className="mt-3 gap-3">
          {backup ? (
            <LoginField key="backup" label={t.backupCode} name="code" autoFocus autoComplete="one-time-code" maxLength={32} placeholder="xxxxx-xxxxx" invalid={!!error} />
          ) : (
            <Field className="gap-1.5">
              <FormLabel htmlFor="login-code" required className="font-normal text-foreground/85">
                {t.code}
              </FormLabel>
              <TotpInput key="totp" id="login-code" invalid={!!error} />
            </Field>
          )}
          <Field orientation="horizontal" className="gap-3">
            <Checkbox id="trust-device" checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
            <FieldLabel htmlFor="trust-device" className="cursor-pointer font-normal">
              {t.trustDevice}
            </FieldLabel>
          </Field>
        </FieldGroup>
        {error && <FieldError className="mt-3">{error === "unknown" ? c.unknownError : t[error]}</FieldError>}
        <Button type="submit" size="lg" disabled={pending} className="mt-6 w-full">
          {pending ? t.verifying : t.verify}
        </Button>
        <Button
          type="button"
          variant="link"
          className="mx-auto mt-3 flex text-muted-foreground"
          onClick={() => {
            setBackup(!backup);
            setError(null);
          }}
        >
          {backup ? t.useApp : t.useBackup}
        </Button>
        <Button type="button" variant="link" className="mx-auto flex text-muted-foreground" onClick={onBack}>
          {t.back}
        </Button>
      </form>
    </div>
  );
}

function LoginField({ label, invalid, ...input }: { label: string; invalid: boolean } & React.ComponentProps<"input">) {
  const id = `login-${input.name}`;
  return (
    <Field className="gap-1.5">
      <FormLabel htmlFor={id} required className="font-normal text-foreground/85">
        {label}
      </FormLabel>
      <Input id={id} required aria-invalid={invalid || undefined} className="h-11 rounded-xl px-3.5 text-[15px]" {...input} />
    </Field>
  );
}
