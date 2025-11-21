import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-neutral-500 text-sm">
          Загружаем логин...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
