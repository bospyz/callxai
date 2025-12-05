"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SECTIONS = ["home", "how", "cases", "pricing"] as const;
type SectionId = (typeof SECTIONS)[number];

export default function LandingHeader() {
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id as SectionId;
          if (SECTIONS.includes(id)) {
            setActiveSection(id);
          }
        });
      },
      {
        threshold: 0.5,
      }
    );

    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const linkClass = (id: SectionId) =>
    [
      "px-3 py-1 rounded-full text-[12px] transition-colors",
      activeSection === id
        ? "bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.4)]"
        : "text-neutral-200/80 hover:text-white hover:bg-white/5",
    ].join(" ");

  const handleNavClick = () => {
    setIsMenuOpen(false);
  };

  return (
    <header className="fixed top-4 inset-x-0 z-30 flex justify-center px-3 sm:px-4">
      <div className="pointer-events-auto w-full max-w-5xl rounded-full border border-white/15 bg-black/40 shadow-[0_0_40px_rgba(15,23,42,0.9)] backdrop-blur-3xl px-4 sm:px-6 py-2 sm:py-2.5">
        <div className="flex items-center gap-3">
          {/* ЛОГО / НЭЙМ слева */}
          <div className="flex items-center gap-2 flex-none">
            <span className="text-[10px] sm:text-xs font-semibold tracking-[0.22em] uppercase text-neutral-200">
              CALLXAI
            </span>
          </div>

          {/* НАВИГАЦИЯ по центру (десктоп) */}
          <nav className="hidden md:flex items-center gap-4 mx-auto">
            <Link href="#home" className={linkClass("home")}>
              Главная
            </Link>
            <Link href="#how" className={linkClass("how")}>
              Как работает
            </Link>
            <Link href="#cases" className={linkClass("cases")}>
              Отрасли
            </Link>
            <Link href="#pricing" className={linkClass("pricing")}>
              Тарифы
            </Link>
          </nav>

          {/* Правый блок: кнопки + бургер */}
          <div className="flex items-center gap-2 text-[11px] sm:text-xs flex-none ml-auto">
            {/* Бургер только на мобилке */}
            <button
              type="button"
              className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/15 text-neutral-200 hover:bg-white/10 transition-colors"
              onClick={() => setIsMenuOpen((v) => !v)}
              aria-label="Открыть меню"
            >
              {isMenuOpen ? (
                // Иконка "крестик"
                <span className="block h-3 w-3 relative">
                  <span className="absolute inset-0 h-[2px] w-full bg-current rotate-45 translate-y-[1px]" />
                  <span className="absolute inset-0 h-[2px] w-full bg-current -rotate-45 -translate-y-[1px]" />
                </span>
              ) : (
                // Иконка "бургер"
                <span className="block h-3 w-3 relative">
                  <span className="absolute inset-x-0 top-0 h-[2px] bg-current" />
                  <span className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-current" />
                  <span className="absolute inset-x-0 bottom-0 h-[2px] bg-current" />
                </span>
              )}
            </button>

            {/* Войти */}
            <Link
              href="/auth/login"
              className="hidden sm:inline text-neutral-200 hover:text-white transition-colors"
            >
              Войти
            </Link>

            {/* CTA "Начать" */}
            <Link href="/auth/register">
              <button
                className="inline-flex items-center justify-center h-9 sm:h-10 px-6 sm:px-7 text-[11px] sm:text-xs font-medium rounded-full bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.6)] hover:bg-neutral-100 transition-colors"
              >
                Начать
              </button>
            </Link>
          </div>
        </div>

        {/* Мобильное меню под капсулой */}
        {isMenuOpen && (
          <div className="md:hidden mt-2 -mx-1 rounded-3xl border border-white/10 bg-black/85 backdrop-blur-3xl px-3 py-3 flex flex-col gap-2 text-[13px]">
            <Link
              href="#home"
              className={linkClass("home")}
              onClick={handleNavClick}
            >
              Главная
            </Link>
            <Link
              href="#how"
              className={linkClass("how")}
              onClick={handleNavClick}
            >
              Как работает
            </Link>
            <Link
              href="#cases"
              className={linkClass("cases")}
              onClick={handleNavClick}
            >
              Отрасли
            </Link>
            <Link
              href="#pricing"
              className={linkClass("pricing")}
              onClick={handleNavClick}
            >
              Тарифы
            </Link>
            <div className="mt-1 flex items-center justify-between gap-2">
              <Link
                href="/auth/login"
                onClick={handleNavClick}
                className="text-neutral-200 hover:text-white transition-colors"
              >
                Войти
              </Link>
              <Link href="/auth/register" onClick={handleNavClick}>
                <button className="inline-flex items-center justify-center h-9 px-6 text-[11px] font-medium rounded-full bg-white text-black shadow-[0_0_18px_rgba(255,255,255,0.5)] hover:bg-neutral-100 transition-colors">
                  Начать
                </button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
