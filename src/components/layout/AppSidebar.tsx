"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PhoneCall,
  Users,
  LineChart,
  PanelsTopLeft,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  Icon: LucideIcon;
};

const mainItems: NavItem[] = [
  { href: "/app", Icon: LayoutDashboard },
  { href: "/app/calls", Icon: PhoneCall },
  { href: "/app/managers", Icon: Users },
  { href: "/app/analytics", Icon: LineChart },
  { href: "/app/integrations", Icon: PanelsTopLeft },
];

const systemItems: NavItem[] = [
  { href: "/app/billing", Icon: CreditCard },
  { href: "/app/settings", Icon: Settings },
];

type NavIconButtonProps = {
  href: string;
  Icon: LucideIcon;
  active: boolean;
  size?: "md" | "lg";
};

function NavIconButton({ href, Icon, active, size = "lg" }: NavIconButtonProps) {
  const boxSize =
    size === "lg"
      ? "h-11 w-11 rounded-2xl"
      : "h-10 w-10 rounded-2xl";

  return (
    <Link href={href} className="group">
      <div
        className={`
          flex items-center justify-center border text-[13px] transition-all
          ${boxSize}
          ${
            active
              ? "border-[#D1FE17] bg-white/10 text-white shadow-[0_10px_30px_rgba(209,254,23,0.35)]"
              : "border-white/15 bg-white/5 text-white/60 backdrop-blur-xl group-hover:bg-white/10 group-hover:text-white group-hover:border-white/40"
          }
        `}
      >
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </div>
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const email = session?.user?.email ?? "demo@callxai.dev";
  const name = session?.user?.name ?? "Руководитель";
  const avatarLetter = (name || email)[0]?.toUpperCase() ?? "C";

  function isActive(href: string) {
    if (href === "/app") {
      return pathname === "/app" || pathname === "/app/";
    }
    return pathname === href || pathname?.startsWith(href + "/");
  }

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <>
      {/* MOBILE: верхняя панель */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Лого */}
          <Link href="/app" className="group">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 border border-white/20 text-[11px] font-semibold tracking-[0.18em] text-white group-hover:bg-white/20 group-hover:border-white/40 transition">
              CX
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {/* Аватар */}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/25 text-[13px] font-semibold text-white">
              {avatarLetter}
            </div>

            {/* Кнопка меню */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/20 bg-white/5 text-white/80 hover:border-white/50 hover:bg-white/10 transition"
            >
              {mobileMenuOpen ? (
                <X className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Menu className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        {/* Дропдаун меню под шапкой */}
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/90 backdrop-blur-xl">
            <div className="px-4 py-3 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                {mainItems.map((item) => (
                  <NavIconButton
                    key={item.href}
                    href={item.href}
                    Icon={item.Icon}
                    active={isActive(item.href)}
                    size="md"
                  />
                ))}
              </div>

              <div className="h-px w-full bg-white/10" />

              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex gap-3">
                  {systemItems.map((item) => (
                    <NavIconButton
                      key={item.href}
                      href={item.href}
                      Icon={item.Icon}
                      active={isActive(item.href)}
                      size="md"
                    />
                  ))}
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-3 py-2 text-[13px] text-white/70 hover:text-red-400 hover:border-red-300 hover:bg-red-500/10 transition-all"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.7} />
                  <span>Выйти</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* MOBILE: нижняя док-навигация */}
      <nav className="fixed bottom-3 inset-x-0 z-40 flex justify-center md:hidden">
        <div className="flex items-center gap-3 rounded-3xl border border-white/15 bg-black/80 px-3 py-2 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          {mainItems.slice(0, 4).map((item) => (
            <NavIconButton
              key={item.href}
              href={item.href}
              Icon={item.Icon}
              active={isActive(item.href)}
              size="md"
            />
          ))}
        </div>
      </nav>

      {/* DESKTOP: левый сайдбар */}
      <aside className="hidden md:flex md:sticky md:top-0 h-screen w-[96px] bg-gradient-to-b from-black via-[#050814] to-black px-4 py-5">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="
            flex h-full w-full flex-col items-center justify-between
            rounded-3xl border border-white/15 bg-white/5
            shadow-[0_26px_80px_rgba(0,0,0,0.7)]
            backdrop-blur-2xl py-5
          "
        >
          {/* Лого */}
          <Link href="/app" className="group">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 border border-white/20 text-[11px] font-semibold tracking-[0.18em] text-white group-hover:bg-white/20 group-hover:border-white/40 transition">
              CX
            </div>
          </Link>

          {/* Навигация */}
          <div className="flex flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-3">
              {mainItems.map((item) => (
                <NavIconButton
                  key={item.href}
                  href={item.href}
                  Icon={item.Icon}
                  active={isActive(item.href)}
                  size="lg"
                />
              ))}
            </div>

            <div className="h-px w-8 bg-white/15" />

            <div className="flex flex-col items-center gap-3">
              {systemItems.map((item) => (
                <NavIconButton
                  key={item.href}
                  href={item.href}
                  Icon={item.Icon}
                  active={isActive(item.href)}
                  size="lg"
                />
              ))}
            </div>
          </div>

          {/* Пользователь + выход */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 border border-white/25 text-[13px] font-semibold text-white">
              {avatarLetter}
            </div>

            <button
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/20 bg-white/5 text-white/60 hover:text-red-400 hover:border-red-300 hover:bg-red-500/10 transition-all"
              title="Выйти"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        </motion.div>
      </aside>
    </>
  );
}
