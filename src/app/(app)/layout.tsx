// src/app/app/layout.tsx
"use client";

import AppSidebar from "@/components/layout/AppSidebar";
import AppHeader from "@/components/layout/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-black">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        {/* Хэдер показываем только на мобилке */}
        <div className="md:hidden">
          <AppHeader />
        </div>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4">
          {children}
        </main>
      </div>
    </div>
  );
}
