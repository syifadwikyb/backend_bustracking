import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

const PHASES = [
  { name: "Fase 1 - Baseline",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60, spawnBatch: 5  },
  { name: "Fase 2 - Spike",     phaseDuration: 30,  spawnTotal: 500, spawnOver: 30,  dwellTime: 30, spawnBatch: 20 },
  { name: "Fase 3 - High", phaseDuration: 120, spawnTotal: 500, spawnOver: 120, dwellTime: 120, spawnBatch: 5  },
  { name: "Fase 4 - Recovery",  phaseDuration: 60,  spawnTotal: 60,  spawnOver: 60,  dwellTime: 60,  spawnBatch: 5  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let concurrentActive = 0;
let totalCreated = 0;

const measureHalfRtt = () => {
  return new Promise((resolve) => {
    const probe = io(SERVER, { transports: ["websocket"], reconnection: false, timeout: 10000, forceNew: true });
    const rtts = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      probe.disconnect();
      const avg = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 50;
      console.log(`[RTT Probe] avg RTT: ${avg.toFixed(2)}ms | half RTT: ${(avg / 2).toFixed(2)}ms`);
      resolve(avg / 2);
    };
    probe.on("connect", () => {
      let count = 0;
      const ping = () => {
        if (count >= 5) { finish(); return; }
        const t0 = Date.now();
        probe.emit("ping_probe", t0, () => { rtts.push(Date.now() - t0); count++; setTimeout(ping, 100); });
      };
      ping();
    });
    probe.on("connect_error", finish);
    setTimeout(finish, 5000);
  });
};

const runUser = (dwellTime, stats, halfRtt) => {
  let finished = false;
  const promise = new Promise((resolve) => {
    const socket = io(SERVER, { transports: ["websocket"], reconnection: false, timeout: 10000, forceNew: true });
    const finish = () => { if (!finished) { finished = true; resolve(); } };

    socket.on("bus_location", (data) => {
      if (data?.server_time) {
        const latency = Math.max(0, (Date.now() - data.server_time) + halfRtt);
        stats.latencies.push(latency);
      }
      stats.eventsReceived++;
    });

    const globalTimeout = setTimeout(() => { stats.errors++; socket.disconnect(); finish(); }, (dwellTime + 10) * 1000);

    socket.on("connect", () => {
      concurrentActive++;
      if (concurrentActive > stats.peakConcurrent) stats.peakConcurrent = concurrentActive;
      socket.emit("join_bus_room", 1);
      setTimeout(() => {
        clearTimeout(globalTimeout);
        concurrentActive = Math.max(0, concurrentActive - 1);
        socket.disconnect();
        finish();
      }, dwellTime * 1000);
    });

    socket.on("connect_error", () => { stats.errors++; clearTimeout(globalTimeout); finish(); });
  });
  return { promise, isFinished: () => finished };
};

const spawnUsers = async (phase, stats, allUsers, halfRtt) => {
  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const interval = (phase.spawnOver * 1000) / totalBatches;
  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    for (let i = 0; i < count; i++) { stats.created++; totalCreated++; allUsers.push(runUser(phase.dwellTime, stats, halfRtt)); }
    if (b < totalBatches - 1) await sleep(interval);
  }
};

const runPhase = async (phase, halfRtt, carryover = []) => {
  console.log(`\n${"=".repeat(55)}`);
  console.log(`🚀 ${phase.name}`);
  console.log(`   Spawn: ${phase.spawnTotal} user | Durasi: ${phase.phaseDuration}s | Carryover: ${carryover.length}`);

  const stats = { created: 0, errors: 0, eventsReceived: 0, peakConcurrent: concurrentActive, latencies: [] };
  const phaseStart = Date.now();
  const allUsers = [...carryover];

  const logInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
    const avgLat = stats.latencies.length ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length) : "-";
    console.log(`   ⏱ ${String(elapsed).padStart(3)}s | concurrent: ${concurrentActive} | events: ${stats.eventsReceived} | avg lat: ${avgLat}ms | errors: ${stats.errors}`);
  }, 10_000);

  await Promise.all([spawnUsers(phase, stats, allUsers, halfRtt), sleep(phase.phaseDuration * 1000)]);
  clearInterval(logInterval);

  const remaining = allUsers.filter((u) => !u.isFinished());
  const elapsed = Math.max((Date.now() - phaseStart) / 1000, 1);
  const lat = [...stats.latencies].sort((a, b) => a - b);
  const avgLat = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
  const pct = (p) => lat.length ? lat[Math.max(0, Math.ceil((p / 100) * lat.length) - 1)] : null;
  const errorRate = stats.created ? ((stats.errors / stats.created) * 100).toFixed(2) : "0.00";
  const throughput = (stats.eventsReceived / elapsed).toFixed(2);

  console.log(`\n📊 Hasil ${phase.name}`);
  console.log(`   Users dibuat    : ${stats.created}`);
  console.log(`   Peak concurrent : ${stats.peakConcurrent}`);
  console.log(`   Carryover       : ${remaining.length}`);
  console.log(`   Error rate      : ${errorRate}%`);
  console.log(`   Throughput      : ${throughput} event/s`);
  console.log(`   Events diterima : ${stats.eventsReceived}`);
  if (lat.length) {
    console.log(`   Latency avg     : ${avgLat}ms`);
    console.log(`   p50/p95/p99     : ${pct(50)} / ${pct(95)} / ${pct(99)} ms`);
    console.log(`   min / max       : ${lat[0]} / ${lat[lat.length - 1]} ms`);
  } else {
    console.log(`   Latency         : tidak tersedia`);
  }

  return {
    result: { phase: phase.name, created: stats.created, peak: stats.peakConcurrent, errorRate, throughput, latency: { avg: avgLat, p50: pct(50), p95: pct(95), p99: pct(99) } },
    remaining,
  };
};

console.log("🚌 SPIKE TEST - Bus Tracking");
console.log(`   Server: ${SERVER}`);
console.log("\n🔍 Mengukur RTT...");
const halfRtt = await measureHalfRtt();

const finalTable = [];
let carryover = [];

for (let i = 0; i < PHASES.length; i++) {
  const { result, remaining } = await runPhase(PHASES[i], halfRtt, carryover);
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
  carryover = remaining;
  if (i < PHASES.length - 1) { console.log("\n⏳ Jeda 3 detik..."); await sleep(3000); }
}

if (carryover.length > 0) {
  console.log(`\n⏳ Menunggu ${carryover.length} user terakhir selesai...`);
  await Promise.all(carryover.map((u) => u.promise));
}

console.log("\n📋 RINGKASAN AKHIR");
console.table(finalTable);
console.log("\n✅ Spike test selesai.");