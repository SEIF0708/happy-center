import type { Locale } from "@/types/domain";

export function workerIdShareMessage(locale: Locale, workerCode: string): string {
  if (locale === "ar") {
    return `مرحباً! تم إنشاء سجل العمل الخاص بك في Happy Center. رقم العامل الخاص بك هو: ${workerCode}. يرجى الاحتفاظ بهذا الرقم، حيث ستحتاج إليه عند الاستفسار عن بيانات العمل.`;
  }
  return `Merhaba! Happy Center çalışma kaydınız oluşturuldu. Size ait çalışan numarası: ${workerCode}. Lütfen bu numarayı saklayın. İşlemlerinizde bu numara kullanılacaktır.`;
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
