/**
 * ============================================================
 * SPIKE TEST - REALTIME BUS TRACKING (LATENCY FIXED)
 * ============================================================
 */

import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

let concurrentActive = 0;
let totalCreated = 0;

// ============================================================
// SKENARIO
// ============================================================
const PHASES = [
  {
    name: "Fase 1 - 60 user (60 detik)",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,
    dwellTime: 180,
  },
  {
    name: "Fase 2 - Spike 500 user (10 detik)",
    phaseDuration: 10,
    spawnTotal: 500,
    spawnOver: 10,
    dwellTime: 180,
    spawnBatch: 25,
  },
  {
    name: "Fase 3 - Tambah 500 user (120 detik)",
    phaseDuration: 120,
    spawnTotal: 500,
    spawnOver: 120,
    dwellTime: 180,
  },
  {
    name: "Fase 4 - Tambah 60 user (60 detik)",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,
    dwellTime: 120,
  },
];

// ============================================================
// USER SIMULATION
// ============================================================
const runUser = (userId, dwellTime, stats) => {
  return new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
      forceNew: true,
    });

    let connected = false;
    let timeOffset = 0;

    socket.on("connect", () => {
      connected = true;
      concurrentActive++;
      stats.peakConcurrent = Math.max(stats.peakConcurrent, concurrentActive);

      socket.emit("join_bus_room", 1);

      // =========================
      // 🔥 TIME SYNC
      // =========================
      const t0 = Date.now();
      socket.emit("sync_time");

      socket.once("sync_time_response", (serverTime) => {
        const t1 = Date.now();
        const rtt = t1 - t0;

        const estimatedServerNow = serverTime + rtt / 2;
        timeOffset = estimatedServerNow - t1;
      });

      // =========================
      // 🔥 RECEIVE DATA (LATENCY)
      // =========================
      socket.on("bus_location_update", (data) => {
        const now = Date.now() + timeOffset;
        const latency = now - data.server_time;

        stats.latencies.push(latency);
        stats.received++;
      });

      // =========================
      // DISCONNECT
      // =========================
      setTimeout(() => {
        socket.disconnect();
        resolve();
      }, dwellTime * 1000);
    });

    socket.on("connect_error", () => {
      stats.errors++;
      resolve();
    });

    socket.on("disconnect", () => {
      if (connected) {
        concurrentActive = Math.max(0, concurrentActive - 1);
      }
    });
  });
};

// ============================================================
// SPAWN USER
// ============================================================
const spawnUsers = async (phase, stats, allPromises) => {
  if (phase.spawnTotal === 0) return;

  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const start = b * batchSize;
    const end = Math.min(start + batchSize, phase.spawnTotal);

    for (let i = start; i < end; i++) {
      const userId = totalCreated++;
      stats.created++;

      const p = runUser(userId, phase.dwellTime, stats);
      allPromises.push(p);
    }

    if (b < totalBatches - 1) {
      await sleep(interval);
    }
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
    received: 0,
    latencies: [],
    peakConcurrent: concurrentActive,
  };

  const start = Date.now();
  const allPromises = [...carryover];

  const log = setInterval(() => {
    const t = Math.floor((Date.now() - start) / 1000);
    console.log(
      `⏱ ${t}s | active: ${concurrentActive} | created: ${stats.created} | recv: ${stats.received}`
    );
  }, 10000);

  await Promise.all([
    spawnUsers(phase, stats, allPromises),
    sleep(phase.phaseDuration * 1000),
  ]);

  clearInterval(log);

  // cek yang masih hidup
  const remaining = [];
  for (const p of allPromises) {
    const done = await Promise.race([
      p.then(() => true),
      sleep(0).then(() => false),
    ]);
    if (!done) remaining.push(p);
  }

  // statistik
  const lat = stats.latencies.sort((a, b) => a - b);

  const p95 = percentile(lat, 95);
  const avg = lat.length
    ? (lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(0)
    : "-";

  const duration = (Date.now() - start) / 1000;
  const throughput = (stats.received / duration).toFixed(1);

  console.log(`\n📊 HASIL ${phase.name}`);
  console.log(`Peak User     : ${stats.peakConcurrent}`);
  console.log(`Error         : ${stats.errors}`);
  console.log(`Throughput    : ${throughput} msg/s`);
  console.log(`Latency avg   : ${avg} ms`);
  console.log(`Latency p95   : ${p95 ?? "-"} ms`);

  return { remaining };
};

// ============================================================
// HELPER
// ============================================================
const percentile = (arr, p) => {
  if (!arr.length) return null;
  const idx = Math.ceil((p / 100) * arr.length) - 1;
  return arr[idx];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// MAIN
// ============================================================
console.log("🔥 SPIKE TEST REALTIME (LATENCY FIXED)");

let carryover = [];

for (let i = 0; i < PHASES.length; i++) {
  const { remaining } = await runPhase(PHASES[i], carryover);
  carryover = remaining;

  if (i < PHASES.length - 1) {
    await sleep(3000);
  }
}

if (carryover.length > 0) {
  await Promise.all(carryover);
}

console.log("\n✅ TEST SELESAI");