"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { normalizeIranMobile, toAsciiDigits } from "@/lib/phone";
import { authErrorKey, type AuthErrorKey } from "../errors";
import { importGuestData } from "../import-guest";
import { OtpInput } from "./otp-input";

type Method = "phone" | "email";
type Step = "identifier" | "code";

const RESEND_SEC = 60;

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tehran";
  } catch {
    return "Asia/Tehran";
  }
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function LoginScreen({ returnTo = null }: { returnTo?: string | null }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [resendAt]);

  function armCooldown() {
    setResendAt(Date.now() + RESEND_SEC * 1000);
    setNow(Date.now());
  }

  function choose(next: Method) {
    if (next === method) return;
    setMethod(next);
    setStep("identifier");
    setIdentifier("");
    setCode("");
    setError(null);
  }

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      if (method === "phone") {
        const parsed = normalizeIranMobile(identifier);
        if (!parsed.ok) {
          setError("invalidPhone");
          return;
        }
        setIdentifier(parsed.e164);
        const result = await authClient.phoneNumber.sendOtp({ phoneNumber: parsed.e164 });
        if (result.error) {
          setError(authErrorKey(result.error));
          return;
        }
      } else {
        const email = identifier.trim().toLowerCase();
        if (!emailOk(email)) {
          setError("invalidEmail");
          return;
        }
        setIdentifier(email);
        const result = await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        });
        if (result.error) {
          setError(authErrorKey(result.error));
          return;
        }
      }
      setStep("code");
      setCode("");
      armCooldown();
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      const profile = { locale, timezone: timeZone() };
      const result =
        method === "phone"
          ? await authClient.phoneNumber.verify({
              phoneNumber: identifier,
              code,
              ...profile,
            })
          : await authClient.signIn.emailOtp({
              email: identifier,
              otp: code,
              name: identifier,
              ...profile,
            });
      if (result.error) {
        setError(authErrorKey(result.error));
        return;
      }
      const userId = result.data?.user.id;
      if (userId) await importGuestData(userId);
      router.push(returnTo ?? "/settings");
      router.refresh();
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "min-h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

  return (
    <div className="flex flex-col">
      <h1 className="text-[22px] font-bold">{t("title")}</h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">{t("lead")}</p>

      <div role="tablist" aria-label={t("method")} className="mt-6 flex gap-1 rounded-track bg-surface-2 p-1">
        {(["phone", "email"] as const).map((item) => {
          const selected = item === method;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => choose(item)}
              className={`min-h-11 flex-1 cursor-pointer rounded-tab text-sm font-semibold ${
                selected ? "bg-focus text-white" : "text-muted"
              }`}
            >
              {t(item)}
            </button>
          );
        })}
      </div>

      {step === "identifier" ? (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-muted" htmlFor="identifier">
            {method === "phone" ? t("phoneLabel") : t("emailLabel")}
            <input
              id="identifier"
              dir="ltr"
              className={fieldClass}
              inputMode={method === "phone" ? "tel" : "email"}
              autoComplete={method === "phone" ? "tel" : "email"}
              value={identifier}
              onChange={(event) => {
                const next = event.target.value;
                setIdentifier(method === "phone" ? toAsciiDigits(next) : next);
              }}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 cursor-pointer rounded-control bg-focus text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("sending") : t("sendCode")}
          </button>
        </form>
      ) : (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          <OtpInput
            value={code}
            onChange={setCode}
            label={t("codeLabel")}
            digitLabel={(index) => t("digit", { index })}
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="min-h-11 cursor-pointer rounded-control bg-focus text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? t("verifying") : t("verify")}
          </button>
          <button
            type="button"
            disabled={busy || remaining > 0}
            onClick={() => void sendCode()}
            className="min-h-11 cursor-pointer rounded-control border border-line-strong bg-surface text-[15px] text-ink disabled:opacity-60"
          >
            {remaining > 0 ? t("resendIn", { seconds: remaining }) : t("resend")}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("identifier");
              setCode("");
              setError(null);
            }}
            className="min-h-11 cursor-pointer text-[15px] text-muted"
          >
            {t("changeIdentifier")}
          </button>
        </form>
      )}

      <p role="alert" aria-live="assertive" className="mt-3 min-h-6 text-[13px] text-focus">
        {error ? t(`errors.${error}`) : ""}
      </p>

      <Link href="/" className="mt-4 flex min-h-11 items-center text-[15px] text-muted">
        {t("guest")}
      </Link>
    </div>
  );
}
