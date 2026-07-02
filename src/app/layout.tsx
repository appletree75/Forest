import type { Metadata } from "next";
import type { ReactNode } from "react";

import { validateServerEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: "Forest",
  description: "Forest IT business operations dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  validateServerEnv();

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
