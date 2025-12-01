// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { AppSessionProvider } from "@/components/providers/SessionProvider";

export const metadata: Metadata = {
  title: "callxAI",
  description: "AI-платформа аналитики звонков для sales-команд",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="bg-black text-white antialiased">
        <AppSessionProvider>{children}</AppSessionProvider>
      </body>
    </html>
  );
}
