import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

const PHASES = [
  { name: "Load 100 Users", duration: 300, total: 100, over: 120, batch: 5 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let active = 0;

const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
};

// ─── User Simulation ─────────────────────────────────────────────────────────
const runUser = (phase, stats) => {
  let finished = false;

  const promise = new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
      forceNew: true,
    });

    const finish = () => {
      if (!finished) { finished = true; resolve(); }
    };

    socket.on("bus_location", (data) => {
      if (data?.server_time) {
        const latency = Math.max(0, Date.now() - data.server_time);
        stats.latencies.push(latency);
      }
      stats.eventsReceived++;
    });

    socket.on("connect", () => {
      active++;
      socket.emit("join_bus_room", 1);

      setTimeout(() => {
        active = Math.max(0, active - 1);
        socket.disconnect();
        finish();
      }, phase.duration * 1000);
    });

    socket.on("connect_error", () => {
      stats.errors++;
      finish();
    });
  });

  return { promise, isFinished: () => finished };
};

// ─── Spawn ────────────────────────────────────────────────────────────────────
const spawn = async (phase, stats, users) => {
  const batchSize = phase.batch;
  const totalBatches = Math.ceil(phase.total / batchSize);
  const interval = (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.total - b * batchSize);
    for (let i = 0; i < count; i++) users.push(runUser(phase, stats));
    if (b < totalBatches - 1) await sleep(interval);
  }
};

// ─── Run Phase ────────────────────────────────────────────────────────────────
const runPhase = async (phase) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = { eventsReceived: 0, errors: 0, latencies: [] };
  const users = [];
  const phaseStart = Date.now();

  const logTimer = setInterval(() => {
    const el = Math.floor((Date.now() - phaseStart) / 1000);
    const avgLat = stats.latencies.length
      ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
      : "-";
    console.log(`⏱ ${el}s | active=${active} | events=${stats.eventsReceived} | avg_lat=${avgLat}ms | err=${stats.errors}`);
  }, 10_000);

  await Promise.all([spawn(phase, stats, users), sleep(phase.duration * 1000)]);
  clearInterval(logTimer);
  await Promise.all(users.map((u) => u.promise));

  const actualDuration = Math.max((Date.now() - phaseStart) / 1000, 1);
  const totalEvents = stats.eventsReceived + stats.errors;
  const errorRate = totalEvents > 0
    ? ((stats.errors / totalEvents) * 100).toFixed(3)
    : "0.000";

  const throughput = (stats.eventsReceived / actualDuration).toFixed(2);

  const p50 = percentile(stats.latencies, 50);
  const p95 = percentile(stats.latencies, 95);
  const p99 = percentile(stats.latencies, 99);
  const avgLat = stats.latencies.length
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : null;

  console.log(`\n📊 ${phase.name}`);
  console.log(`Events Received : ${stats.eventsReceived}`);
  console.log(`Errors          : ${stats.errors}`);
  console.log(`Error Rate      : ${errorRate}%`);
  console.log(`Throughput      : ${throughput} event/s  (durasi aktual: ${actualDuration.toFixed(1)}s)`);
  console.log(`Avg Latency     : ${avgLat} ms`);
  console.log(`P50 / P95 / P99 : ${p50} / ${p95} / ${p99} ms`);
};

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log("🚌 SOCKET.IO LOAD TEST — bus_location");
console.log(`   Server: ${SERVER}`);

for (const phase of PHASES) {
  await runPhase(phase);
}

console.log("\n✅ Socket.IO load test selesai.");