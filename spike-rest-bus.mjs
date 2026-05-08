import fetch from "node-fetch";

const ENDPOINT = "http://145.79.15.182:5000/api/bus";

const PHASES = [
  { name: "Baseline", duration: 60,  total: 60,  over: 60,  batch: 5  },
  { name: "Spike",    duration: 30,  total: 500, over: 30,  batch: 20 },
  { name: "Sustain",  duration: 120, total: 500, over: 120, batch: 5  },
  { name: "Recovery", duration: 60,  total: 60,  over: 60,  batch: 5  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;

const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
};

// ─── User ────────────────────────────────────────────────────────────────────
const runUser = async (stats) => {
  const start = Date.now();
  active++;

  try {
    const res = await fetch(ENDPOINT);
    const responseTime = Date.now() - start;
    stats.responseTimes.push(responseTime);

    const now = Date.now();
    if (!stats.firstResponse) stats.firstResponse = now;
    stats.lastResponse = now;

    if (res.ok) stats.success++;
    else stats.errors++;

  } catch {
    stats.errors++;
  } finally {
    active--;
  }
};

// ─── Spawn ───────────────────────────────────────────────────────────────────
const spawn = async (phase, stats, promises) => {
  const batchSize = phase.batch;
  const totalBatches = Math.ceil(phase.total / batchSize);
  const interval = (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.total - b * batchSize);

    for (let i = 0; i < count; i++) {
      promises.push(runUser(stats));
    }

    if (b < totalBatches - 1) {
      await sleep(interval);
    }
  }
};

// ─── Run Phase ───────────────────────────────────────────────────────────────
const runPhase = async (phase) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = {
    success: 0,
    errors: 0,
    responseTimes: [],
    firstResponse: null,
    lastResponse: null,
  };

  const promises = [];
  const start = Date.now();

  const logTimer = setInterval(() => {
    const el = Math.floor((Date.now() - start) / 1000);
    const avg = stats.responseTimes.length
      ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
      : "-";
    console.log(`⏱ ${el}s | active=${active} | success=${stats.success} | avg_rt=${avg}ms | err=${stats.errors}`);
  }, 10_000);

  await Promise.all([
    spawn(phase, stats, promises),
    sleep(phase.duration * 1000),
  ]);

  await Promise.all(promises);
  clearInterval(logTimer);

  // RPS dihitung dari window aktual request (first → last response)
  const activeWindow = stats.firstResponse && stats.lastResponse
    ? Math.max((stats.lastResponse - stats.firstResponse) / 1000, 1)
    : Math.max((Date.now() - start) / 1000, 1);

  const totalRequest = stats.success + stats.errors;
  const errorRate = totalRequest > 0
    ? ((stats.errors / totalRequest) * 100).toFixed(3)
    : "0.000";

  const rps = (stats.success / activeWindow).toFixed(2);

  const avg = stats.responseTimes.length
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : null;

  const p95 = percentile(stats.responseTimes, 95);
  const p99 = percentile(stats.responseTimes, 99);

  console.log(`\n📊 ${phase.name}`);
  console.log(`Total Request : ${totalRequest}`);
  console.log(`Success       : ${stats.success}`);
  console.log(`Errors        : ${stats.errors}`);
  console.log(`Error Rate    : ${errorRate}%`);
  console.log(`RPS           : ${rps}  (window: ${activeWindow.toFixed(1)}s)`);
  console.log(`Avg RT        : ${avg} ms`);
  console.log(`P95 / P99     : ${p95} / ${p99} ms`);

  return { phase: phase.name, totalRequest, errorRate, rps, avg, p95, p99 };
};

// ─── Main ────────────────────────────────────────────────────────────────────
console.log("🚌 REST API SPIKE TEST — /api/bus");
console.log(`   Endpoint: ${ENDPOINT}`);

const finalTable = [];

for (let i = 0; i < PHASES.length; i++) {
  const result = await runPhase(PHASES[i]);
  finalTable.push({
    phase:     result.phase,
    total:     result.totalRequest,
    errorRate: result.errorRate + "%",
    rps:       result.rps + " req/s",
    avgRT:     result.avg != null ? result.avg + "ms" : "N/A",
    p95:       result.p95 != null ? result.p95 + "ms" : "N/A",
    p99:       result.p99 != null ? result.p99 + "ms" : "N/A",
  });

  if (i < PHASES.length - 1) {
    console.log("\n⏳ Jeda 3 detik...");
    await sleep(3000);
  }
}

console.log("\n📋 RINGKASAN AKHIR REST API SPIKE TEST — /api/bus");
console.table(finalTable);
console.log("\n✅ Spike test selesai.");