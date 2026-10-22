"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/constants";
import { localeSchema } from "@/lib/validation/schemas";

export async function setLocale(formData: FormData) {
  const parsed = localeSchema.safeParse(formData.get("locale"));
  if (!parsed.success) {
    throw new Error("Unsupported language selection.");
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
