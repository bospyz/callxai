"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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

export default function AppSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname?.startsWith(href + "/");
  }

  // Закрывать мобильное меню при смене роутов
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* ЛЕВАЯ КОЛОНКА (десктоп — полноценный сайдбар, мобилка — только гамбургер) */}
      <aside
        className="
          w-14 lg:w-60 
          h-screen 
          sticky top-0
          border-r border-neutral-900 
          bg-[#050505]/80 
          backdrop-blur-2xl 
          text-white 
          relative
          overflow-hidden
          flex
        "
      >
        {/* Градиентные переливы */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(74,222,128,0.18),_transparent)] blur-2xl" />
          <div className="absolute -left-24 bottom-28 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.12),_transparent)] blur-2xl" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,#ffffff20_1px,transparent_0)] [background-size:14px_14px]" />
        </div>

        <div className="relative z-10 flex h-full w-full">
          {/* ДЕСКТОП-ВАРИАНТ: полный сайдбар */}
          <div className="hidden lg:flex flex-col h-full w-full px-5 py-6">
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
                    workspace:{" "}
                    <span className="text-neutral-300">Sales HQ</span>
                  </span>
                </div>
              </div>
            </Link>

            {/* Мини-сводка по звонкам */}
            <div className="mb-5 rounded-2xl border border-neutral-800/90 bg-black/50 px-3 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
                  Сегодня
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300">
                  автоанализ
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px] text-neutral-200">
                <span>Звонков в работе</span>
                <span className="font-semibold text-emerald-300">128</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" />
              </div>
              <p className="mt-1.5 text-[10px] text-neutral-500">
                68% от дневного плана проверено CallX.
              </p>
            </div>

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
                        className="
                          absolute inset-0 
                          rounded-lg 
                          bg-gradient-to-r from-emerald-400/15 to-lime-300/10
                          border border-emerald-400/20
                          shadow-[0_0_20px_rgba(74,222,128,0.25)] 
                        "
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
                          className="
                            absolute inset-0 
                            rounded-lg 
                            bg-gradient-to-r from-emerald-400/12 to-lime-300/8
                            border border-emerald-400/15
                          "
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

          {/* МОБИЛКА: узкая полоска с гамбургером */}
          <div className="flex lg:hidden items-center justify-center h-full w-full">
            <button
              onClick={() => setIsOpen(true)}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-neutral-800 bg-black/60 px-2 py-2 hover:bg-black hover:border-neutral-700 transition"
              aria-label="Open navigation"
            >
              <span className="h-0.5 w-5 rounded-full bg-neutral-200" />
              <span className="h-0.5 w-4 rounded-full bg-neutral-400" />
              <span className="h-0.5 w-3 rounded-full bg-neutral-600" />
            </button>
          </div>
        </div>
      </aside>

      {/* МОБИЛЬНОЕ ВЫЕЗЖАЮЩЕЕ МЕНЮ */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* бэкдроп */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setIsOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* сайдбар-оверлей */}
            <motion.div
              className="fixed inset-y-0 left-0 z-50 w-64 max-w-[80%] bg-[#050505]/95 border-r border-neutral-900 lg:hidden"
              initial={{ x: -260, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -260, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -right-20 top-16 h-52 w-52 rounded-full bg-[radial-gradient(circle,_rgba(74,222,128,0.2),_transparent)] blur-2xl" />
                <div className="absolute -left-24 bottom-28 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(34,197,94,0.14),_transparent)] blur-2xl" />
                <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle_at_1px_1px,#ffffff20_1px,transparent_0)] [background-size:14px_14px]" />
              </div>

              <div className="relative z-10 flex flex-col h-full px-4 py-4">
                {/* Хедер оверлея */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-emerald-400 to-lime-300 shadow-[0_0_25px_rgba(74,222,128,0.7)] flex items-center justify-center text-[10px] font-black text-black">
                      CX
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[11px] tracking-[0.3em] uppercase text-neutral-500">
                        callx ai
                      </span>
                      <span className="text-[10px] text-neutral-600">
                        workspace:{" "}
                        <span className="text-neutral-300">Sales HQ</span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-black/60 hover:bg-black hover:border-neutral-700 transition"
                    aria-label="Close navigation"
                  >
                    <span className="relative block h-3 w-3">
                      <span className="absolute inset-0 h-0.5 w-full rotate-45 bg-neutral-300 rounded-full" />
                      <span className="absolute inset-0 h-0.5 w-full -rotate-45 bg-neutral-500 rounded-full" />
                    </span>
                  </button>
                </div>

                {/* Мини-сводка по звонкам */}
                <div className="mb-4 rounded-2xl border border-neutral-800/90 bg-black/60 px-3 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.8)]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
                      Сегодня
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-300">
                      автоанализ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[13px] text-neutral-200">
                    <span>Звонков в работе</span>
                    <span className="font-semibold text-emerald-300">128</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                    <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" />
                  </div>
                  <p className="mt-1.5 text-[10px] text-neutral-500">
                    68% от дневного плана проверено CallX.
                  </p>
                </div>

                {/* ОСНОВНАЯ НАВИГАЦИЯ */}
                <nav className="flex flex-col gap-1 text-[13px] text-neutral-400 mb-4">
                  {mainItems.map((item) => {
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 overflow-hidden",
                          active
                            ? "text-emerald-300"
                            : "hover:bg-neutral-900/60 hover:text-white"
                        )}
                      >
                        {active && (
                          <motion.div
                            layoutId="activeSidebarItemMobile"
                            className="
                              absolute inset-0 
                              rounded-lg 
                              bg-gradient-to-r from-emerald-400/15 to-lime-300/10
                              border border-emerald-400/20
                              shadow-[0_0_20px_rgba(74,222,128,0.25)] 
                            "
                            transition={{
                              type: "spring",
                              stiffness: 350,
                              damping: 30,
                            }}
                          />
                        )}

                        {active && (
                          <motion.div
                            layoutId="activeSidebarIndicatorMobile"
                            className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-md bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]"
                          />
                        )}

                        <span className="relative z-10">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                {/* СИСТЕМНЫЕ РАЗДЕЛЫ */}
                <div className="mt-2 pt-2 border-t border-neutral-900">
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
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "group relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 overflow-hidden",
                            active
                              ? "text-emerald-300"
                              : "hover:bg-neutral-900/60 hover:text-white"
                          )}
                        >
                          {active && (
                            <motion.div
                              layoutId="activeSidebarItemSystemMobile"
                              className="
                                absolute inset-0 
                                rounded-lg 
                                bg-gradient-to-r from-emerald-400/12 to-lime-300/8
                                border border-emerald-400/15
                              "
                              transition={{
                                type: "spring",
                                stiffness: 350,
                                damping: 30,
                              }}
                            />
                          )}

                          {active && (
                            <motion.div
                              layoutId="activeSidebarIndicatorSystemMobile"
                              className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r-md bg-emerald-400/80"
                            />
                          )}

                          <span className="relative z-10">{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                {/* ФУТЕР */}
                <div className="mt-auto pt-4 border-t border-neutral-900 text-[11px] text-neutral-600 flex flex-col gap-2">
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
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
