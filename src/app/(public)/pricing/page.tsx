import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function PricingPage() {
  return (
    <main className="max-w-5xl mx-auto py-16 px-6 space-y-8">
      <h1 className="text-3xl font-bold">Тарифы callxAI</h1>
      <p className="text-neutral-400 text-sm max-w-xl">
        Стартовые тарифы с высокой ценностью и заложенной маржой под инфраструктуру и AI.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold mb-2">Free</h2>
          <p className="text-2xl font-bold">0 </p>
          <p className="text-xs text-neutral-500 mb-3">
            До 3 менеджеров и 200 звонков / мес.
          </p>
          <Badge>для теста</Badge>
        </Card>
        <Card>
          <h2 className="font-semibold mb-2">Pro</h2>
          <p className="text-2xl font-bold">99 000 </p>
          <p className="text-xs text-neutral-500 mb-3">
            До 15 менеджеров, AI-анализ, интеграции, приоритет.
          </p>
          <Badge>рекомендуем</Badge>
        </Card>
        <Card>
          <h2 className="font-semibold mb-2">Enterprise</h2>
          <p className="text-2xl font-bold">от 400 000 </p>
          <p className="text-xs text-neutral-500 mb-3">
            Большие команды, выделенная инфраструктура, кастом.
          </p>
          <Badge>под запрос</Badge>
        </Card>
      </div>
    </main>
  );
}