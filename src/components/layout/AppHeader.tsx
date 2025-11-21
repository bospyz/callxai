"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function AppHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const email = session?.user?.email || "demo@callxai.dev";
  const name = session?.user?.name || "Руководитель";
  const avatarLetter = (name || email)[0]?.toUpperCase() || "C";

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/");
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="
        sticky top-0 z-40
        flex items-center justify-between
        px-5 sm:px-8 lg:px-10 py-3.5
        bg-black/60 backdrop-blur-2xl
        border-b border-neutral-900/80
      "
    >
      {/* LEFT: логотип + панель управления */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-emerald-400 to-lime-300 shadow-[0_0_28px_rgba(74,222,128,0.75)] flex items-center justify-center text-[11px] font-black text-black">
            CX
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">
              callx ai
            </span>
            <span className="text-[11px] text-neutral-500">
              Панель управления отделом продаж
            </span>
          </div>
        </div>

        {/* Быстрые пресеты периода */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px]">
          <button className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/40 text-emerald-300">
            Сегодня
          </button>
          <button className="px-2.5 py-1 rounded-full bg-neutral-900/70 border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-600 transition">
            Неделя
          </button>
          <button className="px-2.5 py-1 rounded-full bg-neutral-900/70 border border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:border-neutral-600 transition">
            Месяц
          </button>
        </div>
      </div>

      {/* RIGHT: профиль + email + выход */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Мини-инфо по профилю */}
        <div className="hidden sm:flex flex-col items-end leading-tight text-[11px]">
          <span className="text-neutral-300 max-w-[170px] truncate">
            {name}
          </span>
          <span className="text-neutral-500 max-w-[190px] truncate">
            {email}
          </span>
        </div>

        {/* Аватар-профиль */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-[12px] font-semibold text-neutral-200 shadow-[0_0_18px_rgba(0,0,0,0.8)]">
            {avatarLetter}
          </div>
        </div>

        {/* Кнопка выхода */}
        <button
          onClick={handleLogout}
          className="
            text-[12px] sm:text-[13px]
            px-3.5 sm:px-4 py-1.5 
            rounded-xl 
            border border-neutral-700 
            text-neutral-300 
            hover:text-white 
            hover:border-emerald-400
            hover:shadow-[0_0_22px_rgba(74,222,128,0.45)]
            transition-all duration-200
          "
        >
          Выйти
        </button>
      </div>
    </motion.header>
  );
}
