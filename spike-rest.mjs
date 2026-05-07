import fetch from "node-fetch";

const SERVER       = "http://145.79.15.182:5000";
const ENDPOINT     = `${SERVER}/api/rest/bus-location`;
const BUS_ID       = 1;
const POLL_INTERVAL_MS = 5000;

const PHASES = [
  { name: "Fase 1 - Baseline",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60, spawnBatch: 5  },
  { name: "Fase 2 - Spike",     phaseDuration: 30,  spawnTotal: 500, spawnOver: 30,  dwellTime: 30, spawnBatch: 20 },
  { name: "Fase 3 - Sustained", phaseDuration: 120, spawnTotal: 500, spawnOver: 120, dwellTime: 120, spawnBatch: 5  },
  { name: "Fase 4 - Recovery",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
];

const sleep      = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
};
const calcStats = (arr) => {
  if (!arr.length) return { min: null, max: null, avg: null, p50: null, p95: null, p99: null };
  const s = [...arr].sort((a, b) => a - b);
  return {
    min: s[0],
    max: s[s.length - 1],
    avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    p50: percentile(arr, 50),
    p95: percentile(arr, 95),
    p99: percentile(arr, 99),
  };
};

let concurrentActive = 0;

const runUser = (dwellTime, stats) => {
  let finished = false;

  const promise = (async () => {
    concurrentActive++;
    if (concurrentActive > stats.peakConcurrent) stats.peakConcurrent = concurrentActive;

    const endTime = Date.now() + dwellTime * 1000;

    while (Date.now() < endTime) {
      const t0 = Date.now();
      try {
        const res = await fetch(ENDPOINT, {
          method: "GET",
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const json = await res.json();
          stats.eventsReceived++;

          // Cari data bus_id yang relevan dari array response
          const busData = Array.isArray(json.data)
            ? json.data.find((b) => b.bus_id === BUS_ID)
            : null;

          if (busData?.server_time) {
            // server_time bisa berupa string ISO atau timestamp angka
            const serverTs = typeof busData.server_time === "number"
              ? busData.server_time
              : new Date(busData.server_time).getTime();

            const latency = Math.max(0, Date.now() - serverTs);
            if (latency < 60_000) stats.latencies.push(latency);
          }
        } else {
          stats.errors++;
        }
      } catch (err) {
        stats.errors++;
      }

      const elapsed = Date.now() - t0;
      const wait    = Math.max(0, POLL_INTERVAL_MS - elapsed);
      if (Date.now() + wait < endTime) await sleep(wait);
      else break;
    }

    concurrentActive = Math.max(0, concurrentActive - 1);
    finished = true;
  })();

  return { promise, isFinished: () => finished };
};

const spawnUsers = async (phase, stats, allUsers) => {
  if (!phase.spawnTotal) return;
  const batchSize    = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval     = (phase.spawnOver * 1000) / totalBatches;
  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    for (let i = 0; i < count; i++) { stats.created++; allUsers.push(runUser(phase.dwellTime, stats)); }
    if (b < totalBatches - 1) await sleep(interval);
  }
};

const runPhase = async (phase, carryover = []) => {
  console.log(`\n${"=".repeat(55)}`);
  console.log(`🌐 ${phase.name}`);
  console.log(`   Spawn: ${phase.spawnTotal} user | Durasi: ${phase.phaseDuration}s | Carryover: ${carryover.length}`);
  console.log(`   Polling interval: ${POLL_INTERVAL_MS / 1000}s per user`);

  const stats = { created: 0, errors: 0, eventsReceived: 0, peakConcurrent: concurrentActive, latencies: [] };
  const phaseStart = Date.now();
  const allUsers   = [...carryover];

  const logTimer = setInterval(() => {
    const el  = Math.floor((Date.now() - phaseStart) / 1000);
    const avg = stats.latencies.length
      ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
      : "-";
    console.log(`   ⏱ ${String(el).padStart(3)}s | concurrent=${concurrentActive} | responses=${stats.eventsReceived} | lat_avg=${avg}ms | err=${stats.errors}`);
  }, 10_000);

  await Promise.all([spawnUsers(phase, stats, allUsers), sleep(phase.phaseDuration * 1000)]);
  clearInterval(logTimer);

  const remaining  = allUsers.filter((u) => !u.isFinished());
  const elapsed    = Math.max((Date.now() - phaseStart) / 1000, 1);
  const totalReq   = stats.eventsReceived + stats.errors;
  const throughput = parseFloat((stats.eventsReceived / elapsed).toFixed(2));
  const errorRate  = totalReq ? parseFloat(((stats.errors / totalReq) * 100).toFixed(2)) : 0;
  const latStats   = calcStats(stats.latencies);

  console.log(`\n📊 Hasil ${phase.name}`);
  console.log(`   Users dibuat    : ${stats.created}`);
  console.log(`   Peak concurrent : ${stats.peakConcurrent}`);
  console.log(`   Carryover       : ${remaining.length}`);
  console.log(`   Total request   : ${totalReq}`);
  console.log(`   Error rate      : ${errorRate}%`);
  console.log(`   Throughput      : ${throughput} resp/s`);
  console.log(`   Responses OK    : ${stats.eventsReceived}`);
  if (latStats.avg !== null) {
    console.log(`   Latency avg     : ${latStats.avg}ms`);
    console.log(`   p50/p95/p99     : ${latStats.p50} / ${latStats.p95} / ${latStats.p99} ms`);
    console.log(`   min / max       : ${latStats.min} / ${latStats.max} ms`);
  } else {
    console.log(`   Latency         : tidak tersedia`);
    console.log(`     └─ Pastikan simulator bus sedang berjalan saat test`);
  }

  return {
    result: { phase: phase.name, created: stats.created, peak: stats.peakConcurrent, errorRate, throughput, latency: latStats },
    remaining,
  };
};

console.log("━".repeat(55));
console.log("🌐 REST API POLLING SPIKE TEST");
console.log(`   Server   : ${SERVER}`);
console.log(`   Endpoint : GET /api/rest/bus-location`);
console.log(`   Bus ID   : ${BUS_ID}`);
console.log(`   Interval : ${POLL_INTERVAL_MS / 1000}s per user`);
console.log(`   Skenario : 4 fase | total 1200 user`);
console.log("━".repeat(55));

const finalTable = [];
let carryover    = [];

for (let i = 0; i < PHASES.length; i++) {
  const { result, remaining } = await runPhase(PHASES[i], carryover);
  finalTable.push({
    phase:      result.phase,
    created:    result.created,
    peak:       result.peak,
    errorRate:  result.errorRate + "%",
    throughput: result.throughput + " resp/s",
    avgLat:     result.latency.avg != null ? result.latency.avg + "ms" : "N/A",
    p50:        result.latency.p50 != null ? result.latency.p50 + "ms" : "N/A",
    p95:        result.latency.p95 != null ? result.latency.p95 + "ms" : "N/A",
    p99:        result.latency.p99 != null ? result.latency.p99 + "ms" : "N/A",
  });
  carryover = remaining;
  if (i < PHASES.length - 1) { console.log("\n⏳ Jeda 3 detik..."); await sleep(3000); }
}

if (carryover.length > 0) {
  console.log(`\n⏳ Menunggu ${carryover.length} user terakhir selesai...`);
  await Promise.all(carryover.map((u) => u.promise));
}

console.log("\n📋 RINGKASAN AKHIR REST API");
console.table(finalTable);
console.log("\n✅ REST API test selesai.");
