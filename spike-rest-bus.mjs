import fetch from "node-fetch";

const ENDPOINT = "http://145.79.15.182:5000/api/bus";

const PHASES = [
  { name: "Baseline", duration: 60, total: 60, over: 60, batch: 5 },
  { name: "Spike",    duration: 30, total: 500, over: 30, batch: 20 },
  { name: "Sustain",  duration: 120, total: 500, over: 120, batch: 5 },
  { name: "Recovery", duration: 60, total: 60, over: 60, batch: 5 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let active = 0;

const percentile = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.ceil((p / 100) * s.length) - 1];
};

const runUser = async (stats) => {
  const start = Date.now();
  active++;

  try {
    const res = await fetch(ENDPOINT);

    const responseTime = Date.now() - start;
    stats.responseTimes.push(responseTime);

    if (res.ok) stats.success++;
    else stats.errors++;

  } catch {
    stats.errors++;
  }

  active--;
};

// SPAWN
const spawn = async (phase, stats) => {
  const batchSize = phase.batch;
  const totalBatches = Math.ceil(phase.total / batchSize);
  const interval = (phase.over * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.total - b * batchSize);

    for (let i = 0; i < count; i++) {
      runUser(stats);
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
  const start = Date.now();

  await Promise.all([
    spawn(phase, stats),
    sleep(phase.duration * 1000),
  ]);

  while (active > 0) {
    await sleep(100);
  }

  const elapsed = (Date.now() - start) / 1000;

  const avg = stats.responseTimes.length
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : null;

  const p95 = percentile(stats.responseTimes, 95);
  const p99 = percentile(stats.responseTimes, 99);

  const rps = (stats.success / elapsed).toFixed(2);

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