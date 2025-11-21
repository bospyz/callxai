type LogLevel = "info" | "warn" | "error";

interface LogContext {
  context?: string;
  extra?: Record<string, unknown>;
}

/**
 * Базовая функция логирования.
 * Сейчас просто пишет в console, позже можно подменить на реальный Sentry.
 */
function baseLog(level: LogLevel, message: string, payload?: unknown, ctx?: LogContext) {
  const prefix = `[${level.toUpperCase()}]`;
  const parts = [prefix, message];

  const extra: Record<string, unknown> = {
    ...((ctx && ctx.context && { context: ctx.context }) || {}),
    ...((ctx && ctx.extra) || {}),
  };

  if (Object.keys(extra).length > 0) {
    parts.push(JSON.stringify(extra));
  }

  if (payload instanceof Error) {
    console.error(...parts, payload.stack || payload.message);
  } else if (payload !== undefined) {
    console.log(...parts, payload);
  } else {
    console.log(...parts);
  }
}

export function logInfo(message: string, ctx?: LogContext) {
  baseLog("info", message, undefined, ctx);
}

export function logWarn(message: string, ctx?: LogContext) {
  baseLog("warn", message, undefined, ctx);
}

export function logError(error: unknown, ctx?: LogContext) {
  const msg = ctx?.context || "Unhandled error";
  baseLog("error", msg, error, ctx);
}

/**
 * helper для API-роутов: обёртка try/catch
 */
export async function withErrorLogging<T>(
  name: string,
  handler: () => Promise<T>
): Promise<T> {
  try {
    return await handler();
  } catch (err) {
    logError(err, { context: name });
    throw err;
  }
}
