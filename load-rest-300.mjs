import fetch from "node-fetch";

const SERVER = "http://145.79.15.182:5000";
const ENDPOINT = `${SERVER}/api/rest/bus-location`;

const BUS_ID = 1;

// =========================
// LOAD TEST CONFIG
// =========================
const PHASES = [
  {
    name: "Load 300 Users",
    duration: 300,
    total: 300,
    over: 120,
    batch: 10,
  },
];

const POLL_INTERVAL_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;

// =========================
// Percentile
// =========================
const percentile = (arr, p) => {
  if (!arr.length) return null;

  const s = [...arr].sort((a, b) => a - b);

  return s[Math.ceil((p / 100) * s.length) - 1];
};

// =========================
// User Simulation
// =========================
const runUser = (phase, stats) => {
  let finished = false;

  const promise = (async () => {
    active++;

    const endTime = Date.now() + phase.duration * 1000;

    while (Date.now() < endTime) {
      const start = Date.now();

      try {
        const res = await fetch(ENDPOINT, {
          method: "GET",
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const json = await res.json();

          stats.responses++;

          // Cari data bus berdasarkan bus_id
          const busData = Array.isArray(json.data)
            ? json.data.find((b) => b.bus_id === BUS_ID)
            : null;

          if (busData?.server_time) {
            const serverTs =
              typeof busData.server_time === "number"
                ? busData.server_time
                : new Date(busData.server_time).getTime();

            // Latency realtime
            const latency = Math.max(
              0,
              Date.now() - serverTs
            );

            if (latency < 60000) {
              stats.latencies.push(latency);
            }
          }
        } else {
          stats.errors++;
        }
      } catch {
        stats.errors++;
      }

      // polling interval
      const elapsed = Date.now() - start;

      const wait = Math.max(
        0,
        POLL_INTERVAL_MS - elapsed
      );

      await sleep(wait);
    }

    active = Math.max(0, active - 1);

    finished = true;
  })();

  return {
    promise,
    isFinished: () => finished,
  };
};

// =========================
// SPAWN USERS
// =========================
const spawn = async (phase, stats, users) => {
  const batchSize = phase.batch;

  const totalBatches = Math.ceil(
    phase.total / batchSize
  );

  const interval =
    (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(
      batchSize,
      phase.total - b * batchSize
    );

    for (let i = 0; i < count; i++) {
      users.push(runUser(phase, stats));
    }

    if (b < totalBatches - 1) {
      await sleep(interval);
    }
  }
};

// =========================
// RUN PHASE
// =========================
const runPhase = async (phase) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = {
    responses: 0,
    errors: 0,
    latencies: [],
  };

  const users = [];

  const logTimer = setInterval(() => {
    const avg =
      stats.latencies.length
        ? Math.round(
            stats.latencies.reduce(
              (a, b) => a + b,
              0
            ) / stats.latencies.length
          )
        : "-";

    console.log(
      `⏱ active=${active} | responses=${stats.responses} | avg latency=${avg}ms | errors=${stats.errors}`
    );
  }, 10000);

  await Promise.all([
    spawn(phase, stats, users),
    sleep(phase.duration * 1000),
  ]);

  clearInterval(logTimer);

  await Promise.all(users.map((u) => u.promise));

  // =========================
  // Metrics
  // =========================
  const avg =
    stats.latencies.length
      ? Math.round(
          stats.latencies.reduce(
            (a, b) => a + b,
            0
          ) / stats.latencies.length
        )
      : null;

  const p50 = percentile(stats.latencies, 50);

  const p95 = percentile(stats.latencies, 95);

  const p99 = percentile(stats.latencies, 99);

  const throughput = (
    stats.responses / phase.duration
  ).toFixed(2);

  const totalReq =
    stats.responses + stats.errors;

  const errorRate =
    totalReq > 0
      ? (
          (stats.errors / totalReq) *
          100
        ).toFixed(3)
      : 0;

  // =========================
  // Result
  // =========================
  console.log(`📊 ${phase.name}`);
  console.log(`Total Request  : ${totalReq}`);
  console.log(`Responses OK   : ${stats.responses}`);
  console.log(`Errors         : ${stats.errors}`);
  console.log(`Error Rate     : ${errorRate}%`);
  console.log(`Throughput     : ${throughput} resp/s`);
  console.log(`Avg Latency    : ${avg} ms`);
  console.log(`P50 / P95 / P99: ${p50} / ${p95} / ${p99} ms`);
};

// =========================
// MAIN
// =========================
console.log("🌐 REST API LOAD TEST");
console.log(`Server   : ${SERVER}`);
console.log(`Endpoint : /api/rest/bus-location`);
console.log(`Polling  : ${POLL_INTERVAL_MS}ms`);

for (const phase of PHASES) {
  await runPhase(phase);
}

console.log("\n✅ Load test selesai");