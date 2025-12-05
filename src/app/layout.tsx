// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { AppSessionProvider } from "@/components/providers/SessionProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://callxai.org"), // твой домен
  title: {
    default: "callxAI — AI-аналитика звонков для sales-команд",
    template: "%s | callxAI",
  },
  description:
    "callxAI расшифровывает и анализирует каждый звонок, оценивает работу менеджеров и показывает, где вы теряете сделки. Интеграция с amoCRM и Bitrix24.",
  icons: {
    icon: "/favicon.ico",      // лежит в public/favicon.ico
    shortcut: "/favicon.ico",
    apple: "/icon.png",        // по желанию: public/icon.png
  },
  openGraph: {
    title: "callxAI — AI-аналитика звонков для sales-команд",
    description:
      "Платформа, которая автоматически расшифровывает звонки, оценивает скрипты и показывает проблемные точки в отделе продаж.",
    url: "https://callxai.org",
    siteName: "callxAI",
    locale: "ru_RU",
    type: "website",
    images: [
      {
        url: "/og-callxai.png", // положи в public/og-callxai.png
        width: 1200,
        height: 630,
        alt: "callxAI — платформа AI-аналитики звонков",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "callxAI — AI-аналитика звонков",
    description:
      "AI-платформа для анализа звонков и повышения конверсии продаж. Интеграции с amoCRM и Bitrix24.",
    images: ["/og-callxai.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
