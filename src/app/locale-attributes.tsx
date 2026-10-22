"use client";

import { useEffect } from "react";
import type { Locale } from "@/types/domain";

export function LocaleAttributes({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale === "ar" ? "ar" : "tr";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return null;
}
