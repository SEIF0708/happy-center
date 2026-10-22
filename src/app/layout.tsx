import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Happy Center Workforce",
  description: "Shift attendance and workforce operations for Happy Center.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      dir="ltr"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
