import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

const PHASES = [
  { name: "Fase 1 - Baseline",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
  { name: "Fase 2 - Spike",     phaseDuration: 30,  spawnTotal: 500, spawnOver: 30,  dwellTime: 30,  spawnBatch: 20 },
  { name: "Fase 3 - High",      phaseDuration: 120, spawnTotal: 500, spawnOver: 120, dwellTime: 120, spawnBatch: 5  },
  { name: "Fase 4 - Recovery",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let concurrentActive = 0;

const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
};

// ─── User Simulation ─────────────────────────────────────────────────────────
const runUser = (dwellTime, phaseStats) => {
  let finished = false;

  const promise = new Promise((resolve) => {
    // Membuat koneksi Socket.IO
    const socket = io(SERVER, { transports: ["websocket"], reconnection: false, timeout: 10000, forceNew: true });
    const finish = () => { if (!finished) { finished = true; resolve(); } };

    socket.on("bus_location", (data) => {
      if (data?.server_time) {
        const latency = Math.max(0, Date.now() - data.server_time);
        phaseStats.latencies.push(latency);
      }
      phaseStats.eventsReceived++;
    });

    const globalTimeout = setTimeout(() => {
      phaseStats.errors++;
      socket.disconnect();
      finish();
    }, (dwellTime + 10) * 1000);

    socket.on("connect", () => {
      concurrentActive++;
      if (concurrentActive > phaseStats.peakConcurrent) phaseStats.peakConcurrent = concurrentActive;

      socket.emit("join_bus_room", 1);

      setTimeout(() => {
        clearTimeout(globalTimeout);
        concurrentActive = Math.max(0, concurrentActive - 1);
        socket.disconnect();
        finish();
      }, dwellTime * 1000);
    });

    socket.on("connect_error", () => {
      phaseStats.errors++;
      clearTimeout(globalTimeout);
      finish();
    });
  });

  return { promise, isFinished: () => finished };
};

// ─── Spawn ────────────────────────────────────────────────────────────────────
const spawnUsers = async (phase, phaseStats, users) => {
  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    for (let i = 0; i < count; i++) {
      phaseStats.created++;
      users.push(runUser(phase.dwellTime, phaseStats));
    }
    if (b < totalBatches - 1) await sleep(interval);
  }
};

// ─── Run Phase ────────────────────────────────────────────────────────────────
const runPhase = async (phase, carryover = []) => {
  console.log(`\n${"=".repeat(55)}`);
  console.log(`🚀 ${phase.name}`);
  console.log(`   Spawn: ${phase.spawnTotal} users | Durasi: ${phase.phaseDuration}s | Carryover: ${carryover.length}`);

  const phaseStats = {
    created: 0,
    errors: 0,
    eventsReceived: 0,
    peakConcurrent: concurrentActive,
    latencies: [],
  };

  const phaseStart = Date.now();

  const newUsers = [];
  await Promise.all([
    spawnUsers(phase, phaseStats, newUsers),
    sleep(phase.phaseDuration * 1000),
  ]);

  await Promise.all(newUsers.map((u) => u.promise));

  if (carryover.length > 0) {
    console.log(`   ⏳ Menunggu ${carryover.length} carryover user selesai...`);
    await Promise.all(carryover.map((u) => u.promise));
  }

  const actualDuration = Math.max((Date.now() - phaseStart) / 1000, 1);
  const throughput = (phaseStats.eventsReceived / actualDuration).toFixed(2);
  const errorRate = phaseStats.created
    ? ((phaseStats.errors / phaseStats.created) * 100).toFixed(2)
    : "0.00";

  const lat = [...phaseStats.latencies].sort((a, b) => a - b);
  const avgLat = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;

  console.log(`\n📊 Hasil ${phase.name}`);
  console.log(`   Users dibuat    : ${phaseStats.created}`);
  console.log(`   Peak concurrent : ${phaseStats.peakConcurrent}`);
  console.log(`   Error rate      : ${errorRate}%`);
  console.log(`   Throughput      : ${throughput} event/s  (dibagi durasi aktual ${actualDuration.toFixed(1)}s)`);
  console.log(`   Events diterima : ${phaseStats.eventsReceived}`);

  if (lat.length) {
    console.log(`   Latency avg     : ${avgLat}ms`);
    console.log(`   p50/p95/p99     : ${percentile(phaseStats.latencies, 50)} / ${percentile(phaseStats.latencies, 95)} / ${percentile(phaseStats.latencies, 99)} ms`);
    console.log(`   min / max       : ${lat[0]} / ${lat[lat.length - 1]} ms`);
  } else {
    console.log(`   Latency         : tidak tersedia`);
  }

  return {
    result: {
      phase: phase.name,
      created: phaseStats.created,
      peak: phaseStats.peakConcurrent,
      errorRate,
      throughput,
      latency: {
        avg: avgLat,
        p50: percentile(phaseStats.latencies, 50),
        p95: percentile(phaseStats.latencies, 95),
        p99: percentile(phaseStats.latencies, 99),
      },
    },
  };
};

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("🚌 SOCKET.IO SPIKE TEST — bus_location");
console.log(`   Server: ${SERVER}`);

const finalTable = [];

for (let i = 0; i < PHASES.length; i++) {
  const { result } = await runPhase(PHASES[i]);

  finalTable.push({
    phase:      result.phase,
    created:    result.created,
    peak:       result.peak,
    errorRate:  result.errorRate + "%",
    throughput: result.throughput + " e/s",
    avgLat:     result.latency.avg != null ? result.latency.avg + "ms" : "N/A",
    p50:        result.latency.p50 != null ? result.latency.p50 + "ms" : "N/A",
    p95:        result.latency.p95 != null ? result.latency.p95 + "ms" : "N/A",
    p99:        result.latency.p99 != null ? result.latency.p99 + "ms" : "N/A",
  });

  if (i < PHASES.length - 1) { console.log("\n⏳ Jeda 3 detik..."); await sleep(3000); }
}

console.log("\n📋 RINGKASAN AKHIR SOCKET.IO SPIKE TEST");
console.table(finalTable);
console.log("\n✅ Spike test selesai.");