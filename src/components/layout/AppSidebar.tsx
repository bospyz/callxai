"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";

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

const ACCENT = "#D1FE17";

type NavItemProps = {
  href: string;
  label: string;
  active: boolean;
};

function NavItem({ href, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] transition-all border
      ${
        active
          ? "bg-neutral-950 border-[#00F6A4] text-white"
          : "bg-black border-neutral-900 text-neutral-300 hover:text-white hover:border-neutral-600 hover:bg-neutral-950"
      }`}
    >
      <span>{label}</span>
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const email = session?.user?.email ?? "demo@callxai.dev";
  const name = session?.user?.name ?? "Руководитель";
  const avatarLetter = (name || email)[0]?.toUpperCase() ?? "C";

  const userAny = session?.user as any;
  const companyName =
    userAny?.companyName ?? userAny?.company?.name ?? "Ваша компания";

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/");
  }

  function isActive(href: string) {
    if (href === "/app") {
      return pathname === "/app" || pathname === "/app/";
    }
    return pathname === href || pathname?.startsWith(href + "/");
  }

  return (
    <aside className="hidden md:flex md:sticky md:top-0 h-screen w-[280px] border-r border-neutral-900 bg-black text-white">
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex h-full w-full flex-col px-4 py-4 gap-6"
      >
        {/* Бренд — ссылка на лендинг */}
        <Link
          href="/"
          className="inline-flex flex-col gap-0.5 rounded-xl border border-neutral-900 bg-neutral-950 px-3 py-2 cursor-pointer transition hover:border-emerald-400/80 hover:bg-neutral-900"
        >
          <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            callx ai
          </span>
          <span className="text-sm font-medium text-neutral-50 max-w-[150px] truncate">
            {companyName}
          </span>
        </Link>

        {/* Основное меню + системное */}
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-600">
              menu
            </div>
            <nav className="space-y-1.5">
              {mainItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                />
              ))}
            </nav>
          </div>

          <div className="space-y-2 border-t border-neutral-900 pt-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-600">
              system
            </div>
            <nav className="space-y-1.5">
              {systemItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item.href)}
                />
              ))}
            </nav>
          </div>

          {/* Статус интеграций */}
          <div className="space-y-2 border-t border-neutral-900 pt-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-neutral-600">
              <span>integrations</span>
              <span
                className="text-[10px] font-medium"
                style={{ color: ACCENT }}
              >
                online
              </span>
            </div>

            <div className="rounded-xl border border-neutral-900 px-3 py-3 space-y-1.5 bg-neutral-950">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-neutral-200">amoCRM</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#00F6A4]" />
              </div>
              <p className="text-[11px] text-neutral-500">
                Синхронизация активна. Новые звонки подтягиваются каждые 15
                минут.
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[11px] font-medium border border-neutral-800 text-neutral-100 hover:border-neutral-500 hover:bg-black transition-all"
              >
                Все звонки
              </button>
            </div>
          </div>
        </div>

        {/* Профиль + версия */}
        <div className="border-t border-neutral-900 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center text-[13px] font-semibold">
                {avatarLetter}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] text-neutral-100 max-w-[120px] truncate">
                  {name}
                </span>
                <span className="text-[11px] text-neutral-500 max-w-[140px] truncate">
                  {email}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-300 hover:text-black hover:bg-[#D1FE17] hover:border-transparent transition-all"
            >
              Выйти
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-600">
            <span>v1.0.0</span>
            <span>{new Date().getFullYear()} · CallX AI</span>
          </div>
        </div>
      </motion.div>
    </aside>
  );
}
