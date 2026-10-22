import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Image from "next/image";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale, getMessages } from "@/lib/i18n";
import {
  createSupabaseServerClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/server";
import { setLocale } from "@/app/actions/locale";
import { LoginForm } from "./login-form";

export const instant = false;

export default async function LoginPage() {
  await connection();
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const t = getMessages(locale);

  let signedIn = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") {
      throw new Error(`Could not verify the current session: ${error.message}`);
    }
    if (user) {
      const { data: supervisor, error: supervisorError } = await supabase
        .from("supervisors")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (supervisorError) {
        throw new Error(`Could not verify supervisor access: ${supervisorError.message}`);
      }
      signedIn = Boolean(supervisor);
      if (!supervisor) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          throw new Error(`Could not clear an unauthorized session: ${signOutError.message}`);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof SupabaseConfigurationError)) {
      throw error;
    }
  }
  if (signedIn) redirect("/");

  return (
    <main className="login-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section aria-labelledby="login-heading" className="login-card">
        <Image alt="Happy Center" className="login-logo" height={42} loading="eager" src="/brand/happy-center-logo.png" width={240} />
        <h1 id="login-heading">{t.loginTitle}</h1>
        <LoginForm locale={locale} />
        <form action={setLocale} className="login-language">
          <button aria-label="Türkçe" className="language-option" name="locale" value="tr" type="submit">TR</button>
          <span aria-hidden="true">·</span>
          <button aria-label="العربية" className="language-option" name="locale" value="ar" type="submit">العربية</button>
        </form>
      </section>
    </main>
  );
}
