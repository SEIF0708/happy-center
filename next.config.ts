import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.103"],
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/reports/payroll-pdf": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
