import fetch from "node-fetch";

const SERVER           = "http://145.79.15.182:5000";
const ENDPOINT         = `${SERVER}/api/rest/bus-location`;
const BUS_ID           = 1;
const POLL_INTERVAL_MS = 5000;

const PHASES = [
  { name: "Fase 1 - Baseline",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
  { name: "Fase 2 - Spike",     phaseDuration: 30,  spawnTotal: 500, spawnOver: 30,  dwellTime: 30,  spawnBatch: 20 },
  { name: "Fase 3 - Sustained", phaseDuration: 120, spawnTotal: 500, spawnOver: 120, dwellTime: 120, spawnBatch: 5  },
  { name: "Fase 4 - Recovery",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ─── User Simulation ─────────────────────────────────────────────────────────
const runUser = (dwellTime, phaseStats) => {
  let finished = false;

  const promise = (async () => {
    concurrentActive++;
    if (concurrentActive > phaseStats.peakConcurrent) phaseStats.peakConcurrent = concurrentActive;

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
          phaseStats.eventsReceived++;

          const busData = Array.isArray(json.data)
            ? json.data.find((b) => b.bus_id === BUS_ID)
            : null;

          if (busData?.server_time) {
            const serverTs = typeof busData.server_time === "number"
              ? busData.server_time
              : new Date(busData.server_time).getTime();

            const latency = Math.max(0, Date.now() - serverTs);

            // Filter outlier: abaikan jika > 60 detik (data terlalu usang / clock skew)
            if (latency < 60_000) phaseStats.latencies.push(latency);
          }
        } else {
          phaseStats.errors++;
        }
      } catch {
        phaseStats.errors++;
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

// ─── Spawn ────────────────────────────────────────────────────────────────────
const spawnUsers = async (phase, phaseStats, users) => {
  if (!phase.spawnTotal) return;
  const batchSize    = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval     = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    for (let i = 0; i < count; i++) {
      phaseStats.created++;
      // FIX: user menerima referensi phaseStats fase ini saja
      users.push(runUser(phase.dwellTime, phaseStats));
    }
    if (b < totalBatches - 1) await sleep(interval);
  }
};

// ─── Run Phase ────────────────────────────────────────────────────────────────
const runPhase = async (phase, carryover = []) => {
  console.log(`\n${"=".repeat(55)}`);
  console.log(`🌐 ${phase.name}`);
  console.log(`   Spawn: ${phase.spawnTotal} user | Durasi: ${phase.phaseDuration}s | Carryover: ${carryover.length}`);
  console.log(`   Polling interval: ${POLL_INTERVAL_MS / 1000}s per user`);

  // FIX: Stats baru per fase — carryover tidak mencemari stats ini
  const phaseStats = {
    created: 0,
    errors: 0,
    eventsReceived: 0,
    peakConcurrent: concurrentActive,
    latencies: [],
  };

  const phaseStart = Date.now();

  // FIX: Hanya spawn user baru, carryover tidak dimasukkan ke allUsers
  const newUsers = [];

  const logTimer = setInterval(() => {
    const el  = Math.floor((Date.now() - phaseStart) / 1000);
    const avg = phaseStats.latencies.length
      ? Math.round(phaseStats.latencies.reduce((a, b) => a + b, 0) / phaseStats.latencies.length)
      : "-";
    console.log(`   ⏱ ${String(el).padStart(3)}s | concurrent=${concurrentActive} | responses=${phaseStats.eventsReceived} | lat_avg=${avg}ms | err=${phaseStats.errors}`);
  }, 10_000);

  await Promise.all([
    spawnUsers(phase, phaseStats, newUsers),
    sleep(phase.phaseDuration * 1000),
  ]);
  clearInterval(logTimer);

  // Tunggu user baru selesai
  await Promise.all(newUsers.map((u) => u.promise));

  // FIX: Carryover ditunggu terpisah, tidak dihitung ke stats fase ini
  if (carryover.length > 0) {
    console.log(`   ⏳ Menunggu ${carryover.length} carryover user selesai (tidak dihitung ke stats fase ini)...`);
    await Promise.all(carryover.map((u) => u.promise));
  }

  // FIX: Throughput pakai waktu aktual bukan phaseDuration
  const actualDuration = Math.max((Date.now() - phaseStart) / 1000, 1);
  const totalReq       = phaseStats.eventsReceived + phaseStats.errors;
  const throughput     = parseFloat((phaseStats.eventsReceived / actualDuration).toFixed(2));
  const errorRate      = totalReq ? parseFloat(((phaseStats.errors / totalReq) * 100).toFixed(2)) : 0;
  const latStats       = calcStats(phaseStats.latencies);

  console.log(`\n📊 Hasil ${phase.name}`);
  console.log(`   Users dibuat    : ${phaseStats.created}`);
  console.log(`   Peak concurrent : ${phaseStats.peakConcurrent}`);
  console.log(`   Total request   : ${totalReq}`);
  console.log(`   Error rate      : ${errorRate}%`);
  console.log(`   Throughput      : ${throughput} resp/s  (durasi aktual: ${actualDuration.toFixed(1)}s)`);
  console.log(`   Responses OK    : ${phaseStats.eventsReceived}`);

  if (latStats.avg !== null) {
    console.log(`   Latency avg     : ${latStats.avg}ms`);
    console.log(`   p50/p95/p99     : ${latStats.p50} / ${latStats.p95} / ${latStats.p99} ms`);
    console.log(`   min / max       : ${latStats.min} / ${latStats.max} ms`);
  } else {
    console.log(`   Latency         : tidak tersedia`);
    console.log(`     └─ Pastikan simulator bus sedang berjalan dan server_time ada di response`);
  }

  // Kembalikan newUsers sebagai carryover untuk fase berikutnya
  // (user yang belum selesai dwellTime-nya)
  const remaining = newUsers.filter((u) => !u.isFinished());

  return {
    result: {
      phase:     phase.name,
      created:   phaseStats.created,
      peak:      phaseStats.peakConcurrent,
      errorRate,
      throughput,
      latency:   latStats,
    },
    remaining,
  };
};

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("━".repeat(55));
console.log("🌐 REST API POLLING SPIKE TEST");
console.log(`   Server   : ${SERVER}`);
console.log(`   Endpoint : GET /api/rest/bus-location`);
console.log(`   Bus ID   : ${BUS_ID}`);
console.log(`   Interval : ${POLL_INTERVAL_MS / 1000}s per user`);
console.log(`   Skenario : 4 fase`);
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

console.log("\n📋 RINGKASAN AKHIR REST API SPIKE TEST");
console.table(finalTable);
console.log("\n✅ REST API spike test selesai.");