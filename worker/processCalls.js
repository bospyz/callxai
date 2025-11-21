const API_BASE = process.env.CALLX_API_URL || "http://localhost:3000";
const WORKER_SECRET = process.env.WORKER_SECRET || "dev-worker-secret";

async function fetchNewCalls() {
  const url = `${API_BASE}/api/calls?status=NEW&limit=5&worker=1&secret=${WORKER_SECRET}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Failed to fetch calls", res.status, text);
      return [];
    }

    const data = await res.json();
    if (!data || !Array.isArray(data.calls)) return [];
    return data.calls;
  } catch (error) {
    console.error("fetchNewCalls error", error);
    return [];
  }
}

async function processOneCall(call) {
  try {
    const res = await fetch(`${API_BASE}/api/calls/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId: call.id, secret: WORKER_SECRET }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `processOneCall failed for ${call.id}`,
        res.status,
        text
      );
    } else {
      console.log(`Call ${call.id} processed`);
    }
  } catch (error) {
    console.error(`processOneCall error for ${call.id}`, error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  console.log("CALLX worker started, API_BASE =", API_BASE);

  while (true) {
    try {
      const calls = await fetchNewCalls();

      if (!calls.length) {
        await sleep(10000);
        continue;
      }

      for (const call of calls) {
        await processOneCall(call);
        await sleep(500);
      }

      await sleep(2000);
    } catch (error) {
      console.error("Worker loop error", error);
      await sleep(5000);
    }
  }
}

loop().catch((error) => {
  console.error("Fatal worker error", error);
  process.exit(1);
});
