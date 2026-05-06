/**
 * ============================================================
 * SPIKE TEST v5 - Bus Tracking Server (FIXED VERSION)
 *
 * Metrik:
 *   - Latency (server timestamp → client receive)
 *   - Error Rate
 *   - Throughput (events/sec)
 *
 * FIXES:
 *   ✔ No Infinity / NaN
 *   ✔ Valid latency only
 *   ✔ Proper carryover tracking
 *   ✔ Stable concurrency handling
 * ============================================================
 */

import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

// ============================================================
// PHASE CONFIG
// ============================================================
const PHASES = [
  {
    name: "Fase 1 - Baseline",
    phaseDuration: 10,
    spawnTotal: 10,
    spawnOver: 10,
    dwellTime: 120,
    spawnBatch: 5,
  },
  {
    name: "Fase 2 - Spike 1",
    phaseDuration: 10,
    spawnTotal: 500,
    spawnOver: 10,
    dwellTime: 180,
    spawnBatch: 20,
  },
  {
    name: "Fase 3 - Sustained",
    phaseDuration: 120,
    spawnTotal: 500,
    spawnOver: 120,
    dwellTime: 120,
    spawnBatch: 5,
  },
  {
    name: "Fase 4 - Recovery",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,
    dwellTime: 60,
    spawnBatch: 5,
  },
];

// ============================================================
// GLOBAL STATE
// ============================================================
let concurrentActive = 0;
let totalCreated = 0;

// ============================================================
// USER SIMULATION (FIXED)
// ============================================================
const runUser = (userId, dwellTime, stats) => {
  let finished = false;

  const promise = new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
      forceNew: true,
    });

    const finish = () => {
      if (!finished) {
        finished = true;
        resolve();
      }
    };

    // ✅ LISTENER DITARUH DI AWAL (ANTI MISS EVENT)
    socket.on("bus_location", (data) => {
      console.log("DATA MASUK:", data);
      stats.eventsReceived++;

      if (data?.server_time && Number.isFinite(data.server_time)) {
        const latency = Date.now() - data.server_time;

        if (Number.isFinite(latency) && latency >= 0 && latency < 10000) {
          stats.latencies.push(latency);
        }
      }
    });

    // timeout global
    const globalTimeout = setTimeout(
      () => {
        stats.errors++;
        stats.errorDetail["timeout"] = (stats.errorDetail["timeout"] || 0) + 1;

        socket.disconnect();
        finish();
      },
      (dwellTime + 10) * 1000,
    );

    socket.on("connect", () => {
      concurrentActive++;

      if (concurrentActive > stats.peakConcurrent) {
        stats.peakConcurrent = concurrentActive;
      }

      socket.emit("join_bus_room", 1);

      setTimeout(() => {
        clearTimeout(globalTimeout);
        concurrentActive = Math.max(0, concurrentActive - 1);
        socket.disconnect();
        finish();
      }, dwellTime * 1000);
    });

    socket.on("connect_error", (err) => {
      stats.errors++;
      stats.errorDetail[err.message] =
        (stats.errorDetail[err.message] || 0) + 1;

      clearTimeout(globalTimeout);
      finish();
    });
  });

  return {
    promise,
    isFinished: () => finished,
  };
};

// ============================================================
// SPAWN USERS
// ============================================================
const spawnUsers = async (phase, stats, allUsers) => {
  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);

    for (let i = 0; i < count; i++) {
      stats.created++;
      totalCreated++;

      const user = runUser(totalCreated, phase.dwellTime, stats);
      allUsers.push(user);
    }

    if (b < totalBatches - 1) await sleep(interval);
  }
};

// ============================================================
// RUN PHASE
// ============================================================
const runPhase = async (phase, carryover = []) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = {
    created: 0,
    errors: 0,
    eventsReceived: 0,
    peakConcurrent: concurrentActive,
    latencies: [],
    errorDetail: {},
  };

  const phaseStart = Date.now();
  const allUsers = [...carryover];

  await Promise.all([
    spawnUsers(phase, stats, allUsers),
    sleep(phase.phaseDuration * 1000),
  ]);

  const remaining = allUsers.filter((u) => !u.isFinished());

  const elapsed = Math.max((Date.now() - phaseStart) / 1000, 1);

  const lat = stats.latencies
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

  const avgLat = lat.length
    ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
    : null;

  const percentile = (p) => {
    if (!lat.length) return null;
    const idx = Math.ceil((p / 100) * lat.length) - 1;
    return lat[Math.max(0, idx)];
  };

  const errorRate = stats.created
    ? ((stats.errors / stats.created) * 100).toFixed(2)
    : "0.00";

  const throughput = (stats.eventsReceived / elapsed).toFixed(2);

  console.log(`📊 ${phase.name}`);
  console.log(`Users dibuat : ${stats.created}`);
  console.log(`Peak user    : ${stats.peakConcurrent}`);
  console.log(`Error rate   : ${errorRate}%`);
  console.log(`Throughput   : ${throughput} event/s`);

  if (lat.length) {
    console.log(`Latency avg  : ${avgLat} ms`);
    console.log(
      `p50 / p95 / p99 : ${percentile(50)} / ${percentile(95)} / ${percentile(99)} ms`,
    );
  } else {
    console.log(`Latency tidak tersedia (timestamp server tidak ada)`);
  }

  return {
    result: {
      phase: phase.name,
      created: stats.created,
      peak: stats.peakConcurrent,
      errorRate,
      throughput,
      latency: {
        avg: avgLat,
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
      },
    },
    remaining,
  };
};

// ============================================================
// HELPERS
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// MAIN
// ============================================================
console.log("🚀 START SPIKE TEST v5");

const results = [];
let carryover = [];

for (let i = 0; i < PHASES.length; i++) {
  const { result, remaining } = await runPhase(PHASES[i], carryover);
  results.push(result);
  carryover = remaining;

  if (i < PHASES.length - 1) {
    console.log("⏳ delay 3 detik...\n");
    await sleep(3000);
  }
}

if (carryover.length > 0) {
  console.log(`Menunggu ${carryover.length} user selesai...`);
  await Promise.all(carryover.map((u) => u.promise));
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log("\n📋 FINAL RESULT");
console.table(results);

console.log("\n✅ Spike test selesai");
