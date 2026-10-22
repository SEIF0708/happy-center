"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/actions/auth";
import type { Locale } from "@/types/domain";
import { getMessages } from "@/lib/i18n";
import { LocaleAttributes } from "@/app/locale-attributes";

export function LoginForm({ locale }: { locale: Locale }) {
  const t = getMessages(locale);
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const error =
    state.error === "configuration"
      ? t.configError
      : state.error === "not_supervisor"
        ? t.notSupervisor
        : state.error
          ? t.loginError
          : null;

  return (
    <>
      <LocaleAttributes locale={locale} />
      <form action={action} className="login-form">
        <label className="field-label" htmlFor="email">{t.email}</label>
        <input
          autoComplete="username"
          className="text-input"
          id="email"
          name="email"
          required
          type="email"
        />
        <label className="field-label" htmlFor="password">{t.password}</label>
        <input
          autoComplete="current-password"
          className="text-input"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary login-button" disabled={pending} type="submit">
          {pending ? "…" : t.login}
        </button>
      </form>
    </>
  );
}
