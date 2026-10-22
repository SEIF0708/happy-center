"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { setLocale } from "@/app/actions/locale";
import { getMessages } from "@/lib/i18n";
import type { Locale } from "@/types/domain";
import { LocaleAttributes } from "@/app/locale-attributes";

const navItems = [
  { href: "/", key: "dashboard", icon: "⌂" },
  { href: "/workers", key: "workers", icon: "♙" },
  { href: "/attendance", key: "attendance", icon: "✓" },
  { href: "/reports", key: "reports", icon: "▤" },
  { href: "/settings", key: "settings", icon: "⚙" },
] as const;

export function WorkforceShell({
  children,
  locale,
  supervisorName,
}: {
  children: React.ReactNode;
  locale: Locale;
  supervisorName: string;
}) {
  const pathname = usePathname();
  const t = getMessages(locale);

  return (
    <div className="app-shell" dir={locale === "ar" ? "rtl" : "ltr"}>
      <LocaleAttributes locale={locale} />
      <aside className="sidebar">
        <Link aria-label={t.appName} className="brand" href="/">
          <Image alt="Happy Center" className="brand-logo" height={30} loading="eager" src="/brand/happy-center-logo.png" width={172} />
        </Link>
        <nav aria-label={locale === "ar" ? "التنقل الرئيسي" : "Ana gezinme"} className="side-nav">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link aria-current={active ? "page" : undefined} className={`nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>
                <span aria-hidden="true" className="nav-icon">{item.icon}</span>
                <span>{t[item.key]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="avatar">{supervisorName.trim().charAt(0).toLocaleUpperCase(locale === "ar" ? "ar" : "tr-TR")}</span>
          <span className="account-name">{supervisorName}</span>
          <form action={signOut}><button className="icon-button" aria-label={t.logout} title={t.logout}>↪</button></form>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <Link aria-label={t.appName} className="mobile-brand" href="/">
            <Image alt="Happy Center" className="brand-logo" height={30} loading="eager" src="/brand/happy-center-logo.png" width={172} />
          </Link>
          <form action={setLocale} className="language-switch">
            <button aria-pressed={locale === "tr"} className={locale === "tr" ? "selected" : ""} name="locale" value="tr" type="submit">TR</button>
            <button aria-pressed={locale === "ar"} className={locale === "ar" ? "selected" : ""} name="locale" value="ar" type="submit">العربية</button>
          </form>
        </header>
        <main className="main-content">{children}</main>
      </div>
      <nav aria-label={locale === "ar" ? "التنقل الرئيسي" : "Ana gezinme"} className="mobile-nav">
        {navItems.slice(0, 4).map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link aria-current={active ? "page" : undefined} className={`mobile-nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>
              <span aria-hidden="true">{item.icon}</span><span>{t[item.key]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
