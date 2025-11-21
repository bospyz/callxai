import { Suspense } from "react";
import BillingClient from "./BillingClient";

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm text-neutral-400">
          Загружаем биллинг...
        </div>
      }
    >
      <BillingClient />
    </Suspense>
  );
}