import Shell from "@/components/layout/Shell";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface PageProps {
  params: { id: string };
}

export default async function CallDetailsPage({ params }: PageProps) {
  const session = await auth();
  const companyId = (session?.user as any)?.companyId as string | undefined;

  if (!companyId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Нет доступа</h1>
      </Shell>
    );
  }

  const call = await db.call.findFirst({
    where: { id: params.id, companyId },
    include: {
      manager: true,
      company: true,
    },
  });

  if (!call) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Звонок не найден</h1>
        <p className="text-sm text-neutral-500">
          Проверьте ссылку или вернитесь к списку звонков.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold mb-2">Звонок #{call.id}</h1>
      <p className="text-xs text-neutral-500">
        Компания: {call.company?.name || ""}
        {call.manager && (
          <>
            {"  "}Менеджер: {call.manager.name}
          </>
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-3 mt-4 text-sm">
        <div className="border border-neutral-900 rounded-2xl p-4 space-y-1">
          <div className="text-neutral-500 text-xs">Статус</div>
          <div className="font-semibold">{call.status}</div>
        </div>
        <div className="border border-neutral-900 rounded-2xl p-4 space-y-1">
          <div className="text-neutral-500 text-xs">Скоринг</div>
          <div className="font-semibold">
            {call.score != null ? `${call.score}/100` : "Пока не оценён"}
          </div>
        </div>
        <div className="border border-neutral-900 rounded-2xl p-4 space-y-1">
          <div className="text-neutral-500 text-xs">Длительность</div>
          <div className="font-semibold">
            {call.duration ? `${call.duration} сек` : ""}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold text-neutral-300">Транскрипт</h2>
        <div className="border border-neutral-900 rounded-2xl p-4 text-xs text-neutral-300 min-h-[120px]">
          {call.transcript ||
            "Транскрипт ещё не загружен. Здесь позже будет текст разговора и AI-анализ."}
        </div>
      </div>
    </Shell>
  );
}
