"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";

const ACCENT = "#D1FE17";

const navItems = [
  { href: "/app", label: "Дэшборд" },
  { href: "/app/calls", label: "Звонки" },
  { href: "/app/managers", label: "Менеджеры" },
  { href: "/app/analytics", label: "Аналитика" },
  { href: "/app/integrations", label: "Интеграции" },
];

export default function AppHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const email = session?.user?.email ?? "demo@callxai.dev";
  const name = session?.user?.name ?? "Руководитель";
  const avatarLetter = (name || email)[0]?.toUpperCase() ?? "C";

  // Название компании, которое ты передаёшь в сессию при регистрации
  const userAny = session?.user as any;
  const companyName =
    userAny?.companyName ??
    userAny?.company?.name ??
    "Компания";

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/");
  }

  // чтобы /app не был активен при /app/analytics и т.п.
  function isActive(href: string) {
    if (href === "/app") {
      return pathname === "/app" || pathname === "/app/";
    }
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="sticky top-0 z-40 flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-3.5 bg-black/70 backdrop-blur-2xl border-b border-neutral-900/80"
    >
      {/* LEFT: бренд + компания (без логотипа CX) */}
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
          callx ai
        </span>
        <span className="text-sm font-medium text-neutral-50 max-w-[200px] truncate">
          {companyName}
        </span>
      </div>

      {/* CENTER: навигация (горизонтально скроллится на мобилке) */}
      <nav className="flex-1 ml-2 sm:ml-4 flex items-center gap-1 overflow-x-auto scrollbar-none text-[11px] sm:text-xs">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border whitespace-nowrap transition-all ${
                active
                  ? "border-[#00F6A4] text-white bg-neutral-950"
                  : "border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-500 hover:bg-neutral-950"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* RIGHT: аккаунт + выход */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
            аккаунт
          </span>
          <span className="text-[11px] text-neutral-300 max-w-[180px] truncate">
            {email}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-700 text-xs font-semibold text-neutral-100">
            {avatarLetter}
          </div>
          <button
            onClick={handleLogout}
            className="text-[11px] sm:text-[12px] px-3.5 sm:px-4 py-1.5 rounded-xl border border-neutral-700 text-neutral-300 hover:text-black hover:bg-[#D1FE17] hover:border-[#D1FE17] transition-all duration-200"
          >
            Выйти
          </button>
        </div>
      </div>
    </motion.header>
  );
}
