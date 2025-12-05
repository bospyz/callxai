"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const STORAGE_KEY = "callx_cookie_consent";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    }
    setVisible(false);
  };

  const handleClose = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <div className="w-full max-w-4xl rounded-2xl p-[1px] bg-gradient-to-r from-emerald-400/50 via-sky-500/40 to-purple-500/50 shadow-[0_0_35px_rgba(15,23,42,0.9)]">
        <div className="rounded-[18px] border border-white/10 bg-black/85 backdrop-blur-2xl px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          {/* Левая часть — текст */}
          <div className="flex-1 text-xs sm:text-sm text-neutral-100/90">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.9)]" />
              <span className="uppercase tracking-[0.24em] text-[9px] sm:text-[10px] text-neutral-400">
                Cookies & Analytics
              </span>
            </div>
            <p className="leading-snug">
              Мы используем cookies для аналитики и улучшения работы CallXAI.  
              Продолжая пользоваться сайтом, вы соглашаетесь с{" "}
              <Link
                href="/privacy"
                className="underline underline-offset-2 decoration-dotted text-emerald-300 hover:text-emerald-200 transition-colors"
              >
                политикой конфиденциальности
              </Link>
              .
            </p>
          </div>

          {/* Правая часть — кнопки */}
          <div className="ml-auto flex items-center gap-2">
            <Button
              className="h-8 px-4 text-[11px] sm:text-xs rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-violet-500 text-black font-medium shadow-[0_0_20px_rgba(56,189,248,0.7)] hover:brightness-110 transition-colors"
              onClick={handleAccept}
            >
              Принять
            </Button>
            <button
              className="text-[11px] sm:text-xs text-neutral-300 hover:text-white/90 transition-colors"
              onClick={handleClose}
            >
              Позже
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
