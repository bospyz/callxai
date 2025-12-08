"use client";

import { motion } from "framer-motion";

export default function AppHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="sticky top-0 z-40 h-4 bg-black/70 backdrop-blur-2xl"
    >
      {/* Пустой хедер — без навигации, без аккаунта, только тонкая полоска/отступ */}
    </motion.header>
  );
}
