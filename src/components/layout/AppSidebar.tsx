"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const mainItems = [
  { href: "/app", label: "Дэшборд" },
  { href: "/app/calls", label: "Звонки" },
  { href: "/app/managers", label: "Менеджеры" },
  { href: "/app/analytics", label: "Аналитика" },
  { href: "/app/integrations", label: "Интеграции" },
];

const systemItems = [
  { href: "/app/billing", label: "Биллинг" },
  { href: "/app/settings", label: "Настройки" },
];

function SidebarInner({ pathname }: { pathname: string | null }) {
  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <>
      {/* Градиентные переливы */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-20 top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(74,222,128,0.18),_transparent)] blur-2xl" />
        <div className="absolute -left-24 bottom-28 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.12),_transparent)] blur-2xl" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,#ffffff20_1px,transparent_0)] [background-size:14px_14px]" />
      </div>

      <div className="relative z-10 flex flex-col h-full px-5 py-6">
        {/* ЛОГО + workspace */}
        <Link
          href="/"
          className="flex items-center justify-between mb-6 group hover:opacity-90 transition"
        >
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-emerald-400 to-lime-300 shadow-[0_0_25px_rgba(74,222,128,0.7)] flex items-center justify-center text-[10px] font-black text-black">
              CX
            </div>

            <div className="flex flex-col leading-tight">
              <span className="text-[11px] tracking-[0.3em] uppercase text-neutral-500 group-hover:text-emerald-400 transition">
                callx ai
              </span>
              <span className="text-[10px] text-neutral-600">
                workspace: <span className="text-neutral-300">Sales HQ</span>
              </span>
            </div>
          </div>
        </Link>

        {/* ОСНОВНАЯ НАВИГАЦИЯ */}
        <nav className="flex flex-col gap-1 text-[13px] text-neutral-400 mb-4">
          {mainItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 overflow-hidden",
                  active
                    ? "text-emerald-300"
                    : "hover:bg-neutral-900/60 hover:text-white"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="activeSidebarItem"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-400/15 to-lime-300/10 border border-emerald-400/20 shadow-[0_0_20px_rgba(74,222,128,0.25)]"
                    transition={{
                      type: "spring",
                      stiffness: 350,
                      damping: 30,
                    }}
                  />
                )}

                {active && (
                  <motion.div
                    layoutId="activeSidebarIndicator"
                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-md bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                  />
                )}

                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* СИСТЕМНЫЕ РАЗДЕЛЫ */}
        <div className="mt-3 pt-3 border-t border-neutral-900">
          <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-600 mb-2">
            система
          </p>

          <nav className="flex flex-col gap-1 text-[13px] text-neutral-400">
            {systemItems.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 overflow-hidden",
                    active
                      ? "text-emerald-300"
                      : "hover:bg-neutral-900/60 hover:text-white"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="activeSidebarItemSystem"
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-400/12 to-lime-300/8 border border-emerald-400/15"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}

                  {active && (
                    <motion.div
                      layoutId="activeSidebarIndicatorSystem"
                      className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-md bg-emerald-400/80"
                    />
                  )}

                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ФУТЕР: статус + версия */}
        <div className="mt-auto pt-5 border-t border-neutral-900 text-[11px] text-neutral-600 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-[pulse_1.6s_ease-in-out_infinite]" />
              <span className="text-neutral-400">amoCRM</span>
            </div>
            <span className="text-neutral-500">API подключено</span>
          </div>

          <div className="flex items-center justify-between text-neutral-700">
            <span>v1.0.0</span>
            <span>© {new Date().getFullYear()} CallXAI</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // закрываем бургер при смене роутов
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Мобильный топ-бар с бургером (сверху слева) */}
      <div className="fixed left-0 top-0 z-40 flex h-12 w-full items-center border-b border-neutral-900 bg-black/80 px-3 text-white backdrop-blur md:hidden">
        <button
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/80 hover:bg-neutral-900 transition"
          aria-label="Открыть меню"
        >
          <div className="flex flex-col gap-0.5">
            <span className="h-[2px] w-4 rounded-full bg-neutral-200" />
            <span className="h-[2px] w-3 rounded-full bg-neutral-400" />
            <span className="h-[2px] w-5 rounded-full bg-neutral-200" />
          </div>
        </button>

        <span className="ml-3 text-[11px] tracking-[0.3em] uppercase text-neutral-500">
          callx ai
        </span>
      </div>

      {/* Десктопный сайдбар */}
      <aside
        className="
          hidden md:flex
          w-60 h-screen 
          sticky top-0
          border-r border-neutral-900 
          bg-[#050505]/80 
          backdrop-blur-2xl 
          flex-col 
          text-white 
          relative
          overflow-hidden
        "
      >
        <SidebarInner pathname={pathname} />
      </aside>

      {/* Мобильный выезжающий сайдбар */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Тёмный фон */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Сам сайдбар */}
          <aside
            className="
              relative z-50 
              h-full w-64 
              border-r border-neutral-900 
              bg-[#050505]/95 
              text-white 
              overflow-hidden
              shadow-[0_0_40px_rgba(0,0,0,0.9)]
            "
          >
            <SidebarInner pathname={pathname} />
          </aside>
        </div>
      )}
    </>
  );
}
