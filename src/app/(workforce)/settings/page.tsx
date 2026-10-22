import { cookies } from "next/headers";
import { connection } from "next/server";
import { LOCALE_COOKIE } from "@/lib/constants";
import { resolveLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/i18n";
import { ModulePlaceholder } from "../module-placeholder";

export const instant = false;

export default async function SettingsPage() {
  await connection();
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const arabic = locale === "ar";
  const t = getMessages(locale);
  return (
    <ModulePlaceholder
      description={arabic
        ? "إعدادات الورديات وحساب المشرف وسجل التدقيق قيد التنفيذ."
        : "Vardiya ayarları, yönetici hesabı ve denetim geçmişi sonraki aşamalarda eklenecek."}
      eyebrow={arabic ? "النظام" : "Sistem"}
      title={arabic ? "الإعدادات" : "Ayarlar"}
      inProgressLabel={t.implementationInProgress}
      emptyDataLabel={t.noUnconfirmedData}
    />
  );
}
