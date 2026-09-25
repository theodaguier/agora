import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useRef } from "react";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

/**
 * The 6 digits of an authenticator app, one box per digit (3 + 3). Submitted
 * under `name="code"` with its form, which is sent as soon as the 6th digit
 * is typed or pasted.
 */
export function TotpInput({ id, invalid, className }: { id: string; invalid: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const slot = (index: number) => <InputOTPSlot key={index} index={index} aria-invalid={invalid || undefined} className={cn("size-11 text-lg", className)} />;
  return (
    <InputOTP
      ref={input}
      id={id}
      name="code"
      maxLength={6}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      required
      containerClassName="justify-center gap-2"
      onComplete={() => input.current?.form?.requestSubmit()}
    >
      <InputOTPGroup>{[0, 1, 2].map(slot)}</InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>{[3, 4, 5].map(slot)}</InputOTPGroup>
    </InputOTP>
  );
}
