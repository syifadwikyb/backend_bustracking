import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

const PHASES = [
  { name: "Load 300 Users", duration: 300, total: 300, over: 120, batch: 10 },
];

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
// RTT Probe
// =========================
const measureHalfRtt = () => {
  return new Promise((resolve) => {
    const probe = io(SERVER, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
      forceNew: true,
    });

    const rtts = [];
    let done = false;

    const finish = () => {
      if (done) return;

      done = true;

      probe.disconnect();

      const avg = rtts.length
        ? rtts.reduce((a, b) => a + b, 0) / rtts.length
        : 50;

      console.log(
        `[RTT Probe] avg RTT: ${avg.toFixed(2)}ms | half RTT: ${(avg / 2).toFixed(2)}ms`
      );

      resolve(avg / 2);
    };

    probe.on("connect", () => {
      let count = 0;

      const ping = () => {
        if (count >= 5) {
          finish();
          return;
        }

        const t0 = Date.now();

        probe.emit("ping_probe", t0, () => {
          rtts.push(Date.now() - t0);

          count++;

          setTimeout(ping, 100);
        });
      };

      ping();
    });

    probe.on("connect_error", finish);

    setTimeout(finish, 5000);
  });
};

// =========================
// User Simulation
// =========================
const runUser = (phase, stats, halfRtt) => {
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

    socket.on("bus_location", (data) => {
      if (data?.server_time) {
        const latency = Math.max(
          0,
          (Date.now() - data.server_time) + halfRtt
        );

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

// =========================
// SPAWN USERS
// =========================
const spawn = async (phase, stats, users, halfRtt) => {
  const batchSize = phase.batch;

  const totalBatches = Math.ceil(phase.total / batchSize);

  const interval = (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(
      batchSize,
      phase.total - b * batchSize
    );

    for (let i = 0; i < count; i++) {
      users.push(runUser(phase, stats, halfRtt));
    }

    if (b < totalBatches - 1) {
      await sleep(interval);
    }
  }
};

// =========================
// RUN PHASE
// =========================
const runPhase = async (phase, halfRtt) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = {
    eventsReceived: 0,
    errors: 0,
    latencies: [],
  };

  const users = [];

  await Promise.all([
    spawn(phase, stats, users, halfRtt),
    sleep(phase.duration * 1000),
  ]);

  await Promise.all(users.map((u) => u.promise));

  const avg =
    stats.latencies.length
      ? Math.round(
          stats.latencies.reduce((a, b) => a + b, 0) /
            stats.latencies.length
        )
      : null;

  const p50 = percentile(stats.latencies, 50);

  const p95 = percentile(stats.latencies, 95);

  const p99 = percentile(stats.latencies, 99);

  const throughput = (
    stats.eventsReceived / phase.duration
  ).toFixed(2);

  const totalEvents = stats.eventsReceived + stats.errors;

  const errorRate =
    totalEvents > 0
      ? ((stats.errors / totalEvents) * 100).toFixed(3)
      : 0;

  console.log(`📊 ${phase.name}`);
  console.log(`Events Received : ${stats.eventsReceived}`);
  console.log(`Errors          : ${stats.errors}`);
  console.log(`Error Rate      : ${errorRate}%`);
  console.log(`Throughput      : ${throughput} event/s`);
  console.log(`Avg Latency     : ${avg} ms`);
  console.log(`P50 / P95 / P99 : ${p50} / ${p95} / ${p99} ms`);
};

// =========================
// MAIN
// =========================
console.log("🚌 SOCKET.IO LOAD TEST");

console.log("\n🔍 Measuring RTT...");

const halfRtt = await measureHalfRtt();

for (const phase of PHASES) {
  await runPhase(phase, halfRtt);
}