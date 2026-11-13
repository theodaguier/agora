import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OrgLogo } from "@/components/OrgLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/** A shared artifact sent here for a session (`/s/<token>`, served by the API): back to it once signed in. */
const sharedLink = () => {
  const next = new URLSearchParams(window.location.search).get("redirect");
  return next && /^\/s\/[\w-]+$/.test(next) ? next : null;
};

export function Login() {
  const navigate = useNavigate();
  const done = () => {
    const next = sharedLink();
    if (next) window.location.assign(next);
    else navigate({ to: "/" });
  };
  const t = useT(auth);
  const c = useT(common);
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const orgName = useOrgTitle();

  if (twoFactor) return <TwoFactorStep onBack={() => setTwoFactor(false)} onDone={done} />;

  return (
    <div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10 md:pt-28">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <OrgLogo className="size-9" />
          <CardTitle>{t.title(orgName)}</CardTitle>
          <CardDescription>{t.hint}</CardDescription>
        </CardHeader>
        <CardContent>
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
          else done();
        }}
      >
        <FieldGroup>
          <LoginField label={t.email} name="email" type="email" autoComplete="email" placeholder={t.emailPlaceholder} invalid={!!error} />
          <LoginField
            label={t.password}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            invalid={!!error}
          />
          {error && <FieldError>{error === "unknown" ? c.unknownError : t[error]}</FieldError>}
          <Field>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t.signingIn : t.signIn}
            </Button>
            <Button variant="link" nativeButton={false} render={<Link to="/forgot-password" />}>
              {t.forgot}
            </Button>
          </Field>
        </FieldGroup>
      </form>
        </CardContent>
      </Card>
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
    <div className="flex min-h-svh w-full items-start justify-center p-6 md:p-10 md:pt-28">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <OrgLogo className="size-9" />
          <CardTitle>{t.twoFactorTitle}</CardTitle>
          <CardDescription>{backup ? t.backupHint : t.twoFactorHint}</CardDescription>
        </CardHeader>
        <CardContent>
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
      >
        <FieldGroup>
          {backup ? (
            <LoginField key="backup" label={t.backupCode} name="code" autoFocus autoComplete="one-time-code" maxLength={32} placeholder="xxxxx-xxxxx" invalid={!!error} />
          ) : (
            <Field>
              <FormLabel htmlFor="login-code" required>
                {t.code}
              </FormLabel>
              <TotpInput key="totp" id="login-code" invalid={!!error} />
            </Field>
          )}
          <Field orientation="horizontal">
            <Checkbox id="trust-device" checked={trust} onCheckedChange={(v) => setTrust(v === true)} />
            <FieldLabel htmlFor="trust-device">
              {t.trustDevice}
            </FieldLabel>
          </Field>
          {error && <FieldError>{error === "unknown" ? c.unknownError : t[error]}</FieldError>}
          <Field>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t.verifying : t.verify}
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setBackup(!backup);
                setError(null);
              }}
            >
              {backup ? t.useApp : t.useBackup}
            </Button>
            <Button type="button" variant="link" onClick={onBack}>
              {t.back}
            </Button>
          </Field>
        </FieldGroup>
      </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginField({ label, invalid, ...input }: { label: string; invalid: boolean } & React.ComponentProps<"input">) {
  const id = `login-${input.name}`;
  return (
    <Field>
      <FormLabel htmlFor={id} required>
        {label}
      </FormLabel>
      <Input id={id} required aria-invalid={invalid || undefined} {...input} />
    </Field>
  );
}
