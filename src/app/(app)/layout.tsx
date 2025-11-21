import AppSidebar from "@/components/layout/AppSidebar";
import AppHeader from "@/components/layout/AppHeader";
import { AppSessionProvider } from "@/components/layout/AppSessionProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white flex">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <AppSessionProvider>
          <AppHeader />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </AppSessionProvider>
      </div>
    </div>
  );
}