import fetch from "node-fetch";

const ENDPOINT = "http://145.79.15.182:5000/api/bus";

const PHASES = [
  { name: "Load 100 Users", duration: 300, total: 100, over: 120, batch: 5 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;

const percentile = (arr, p) => {
  if (!arr.length) return null;
  // Mengurutkan semua response time
  const s = [...arr].sort((a, b) => a - b);
  // Mengambil nilai pada posisi percentil
  return s[Math.ceil((p / 100) * s.length) - 1];
};

const runUser = (phase, stats) => {
  let finished = false;

  const promise = (async () => {
    active++;

    const endTime = Date.now() + phase.duration * 1000;

    while (Date.now() < endTime) {
      const start = Date.now();

      try {
        const res = await fetch(ENDPOINT);

        // Menghitung response time: waktu diterima client - waktu request dikirim
        const responseTime = Date.now() - start;
        stats.responseTimes.push(responseTime);

        if (res.ok) stats.success++;
        else stats.errors++;
      } catch {
        stats.errors++;
      }

      await sleep(1000); // interval user
    }

    active--;
    finished = true;
  })();

  return { promise, isFinished: () => finished };
};

// SPAWN
const spawn = async (phase, stats, users) => {
  const batchSize = phase.batch;
  const totalBatches = Math.ceil(phase.total / batchSize);
  const interval = (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.total - b * batchSize);

    for (let i = 0; i < count; i++) {
      users.push(runUser(phase, stats));
    }

    if (b < totalBatches - 1) {
      await sleep(interval);
    }
  }
};

// RUN PHASE
const runPhase = async (phase) => {
  console.log(`\n🚀 ${phase.name}`);

  const stats = { success: 0, errors: 0, responseTimes: [] };
  const users = [];

  await Promise.all([spawn(phase, stats, users), sleep(phase.duration * 1000)]);

  await Promise.all(users.map((u) => u.promise));

  const avg = stats.responseTimes.length
    ? Math.round(
        stats.responseTimes.reduce((a, b) => a + b, 0) /
          stats.responseTimes.length,
      )
    : null;

  const p95 = percentile(stats.responseTimes, 95);
  const p99 = percentile(stats.responseTimes, 99);

  const rps = (stats.success / phase.duration).toFixed(2);

  const totalRequest = stats.success + stats.errors;

  const errorRate =
    totalRequest > 0 ? ((stats.errors / totalRequest) * 100).toFixed(3) : 0;

  console.log(`📊 ${phase.name}`);
  console.log(`Total Request : ${stats.success + stats.errors}`);
  console.log(`Success       : ${stats.success}`);
  console.log(`Errors        : ${stats.errors}`);
  console.log(`Error Rate    : ${errorRate}%`);
  console.log(`RPS           : ${rps}`);
  console.log(`Avg RT        : ${avg} ms`);
  console.log(`P95 / P99     : ${p95} / ${p99} ms`);
};

// MAIN
for (const phase of PHASES) {
  await runPhase(phase);
}
