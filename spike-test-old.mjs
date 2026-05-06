/**
 * ============================================================
 * SPIKE TEST v5 - Bus Tracking REST API
 *
 * Metrik utama:
 *   - Response Time : waktu dari request sampai response
 *   - Error Rate    : % request yang gagal
 *   - Throughput    : requests per detik yang berhasil
 *
 * Skenario:
 *   Fase 1 - Baseline : +60 req dalam 60 detik
 *   Fase 2 - Spike 1  : +500 req dalam 10 detik
 *   Fase 3 - Spike 2  : +500 req dalam 2 menit
 *   Fase 4 - Recovery : +60 req dalam 60 detik
 *
 * Jalankan: node spike-test.mjs
 * ============================================================
 */

import fetch from "node-fetch";

const SERVER = "http://145.79.15.182:5000";
const ENDPOINT = "/api/rest/bus-location";

// ============================================================
// KONFIGURASI FASE
// ============================================================
const PHASES = [
  {
    name: "Fase 1 - Baseline",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,     // 1 req/detik selama 60 detik
    spawnBatch: 5,
  },
  {
    name: "Fase 2 - Spike 1 (Extreme)",
    phaseDuration: 10,
    spawnTotal: 500,
    spawnOver: 10,     // 50 req/detik selama 10 detik
    spawnBatch: 20,
  },
  {
    name: "Fase 3 - Spike 2 (Sustained)",
    phaseDuration: 120,
    spawnTotal: 500,
    spawnOver: 120,    // ~4 req/detik selama 2 menit
    spawnBatch: 5,
  },
  {
    name: "Fase 4 - Recovery",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,     // 1 req/detik selama 60 detik
    spawnBatch: 5,
  },
];

// ============================================================
// STATE GLOBAL
// ============================================================
let concurrentActive = 0;
let totalCreated = 0;

// ============================================================
// SATU REQUEST — ukur response time
// ============================================================
const makeRequest = async (stats) => {
  const startTime = Date.now();
  try {
    const response = await fetch(`${SERVER}${ENDPOINT}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000, // 10 detik timeout
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (response.ok) {
      stats.successes++;
      stats.responseTimes.push(responseTime);
    } else {
      stats.errors++;
      stats.errorDetail[`HTTP ${response.status}`] =
        (stats.errorDetail[`HTTP ${response.status}`] || 0) + 1;
    }
  } catch (err) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    stats.errors++;
    stats.responseTimes.push(responseTime); // Catat response time meski error
    stats.errorDetail[err.message] =
      (stats.errorDetail[err.message] || 0) + 1;
  }
};

// ============================================================
// SPAWN REQUESTS BERTAHAP
// ============================================================
const spawnRequests = async (phase, stats) => {
  if (phase.spawnTotal === 0) return;

  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const batchIntervalMs = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    const promises = [];
    for (let i = 0; i < count; i++) {
      stats.created++;
      totalCreated++;
      promises.push(makeRequest(stats));
    }
    await Promise.all(promises);
    if (b < totalBatches - 1) await sleep(batchIntervalMs);
  }
};

// ============================================================
// JALANKAN SATU FASE
// ============================================================
const runPhase = async (phase) => {
  console.log(`\n${"=".repeat(62)}`);
  console.log(`🚀 ${phase.name}`);
  console.log(`   Durasi fase  : ${phase.phaseDuration}s`);
  if (phase.spawnTotal > 0) {
    const rate = (phase.spawnTotal / phase.spawnOver).toFixed(1);
    console.log(
      `   Requests baru: ${phase.spawnTotal} req dalam ${phase.spawnOver}s (~${rate} req/s)`,
    );
  }
  console.log(`${"=".repeat(62)}`);

  const stats = {
    created: 0,
    successes: 0,
    errors: 0,
    responseTimes: [],
    errorDetail: {},
  };

  const phaseStart = Date.now();

  // Log progress tiap 10 detik
  const logInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
    const avgRT = stats.responseTimes.length
      ? Math.round(
          stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length,
        )
      : "-";
    process.stdout.write(
      `   ⏱  ${String(elapsed).padStart(3)}s` +
        ` | requests: ${String(stats.created).padStart(5)}` +
        ` | successes: ${String(stats.successes).padStart(5)}` +
        ` | avg RT: ${String(avgRT).padStart(5)}ms` +
        ` | errors: ${stats.errors}\n`,
    );
  }, 10_000);

  // Spawn requests + tunggu durasi fase secara paralel
  await Promise.all([
    spawnRequests(phase, stats),
    sleep(phase.phaseDuration * 1000),
  ]);

  clearInterval(logInterval);

  // HITUNG METRIK
  const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
  const rt = stats.responseTimes.sort((a, b) => a - b);
  const total = stats.created;

  const p50 = percentile(rt, 50);
  const p95 = percentile(rt, 95);
  const p99 = percentile(rt, 99);
  const avgRT = rt.length
    ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length)
    : null;

  // Error rate = errors / total requests
  const errorRate =
    total > 0 ? ((stats.errors / total) * 100).toFixed(1) : "0.0";

  // Throughput = successful requests / durasi fase
  const throughput = (stats.successes / parseFloat(elapsed)).toFixed(1);

  // PRINT HASIL
  console.log(`\n📊 HASIL ${phase.name.toUpperCase()}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`  Requests dibuat     : ${total}`);
  console.log(`  ✅ Successes        : ${stats.successes}`);
  console.log(`  ❌ Errors           : ${stats.errors} (${errorRate}%)`);

  if (Object.keys(stats.errorDetail).length > 0) {
    for (const [msg, cnt] of Object.entries(stats.errorDetail)) {
      console.log(`     └─ [${cnt}x] ${msg}`);
    }
  }

  console.log(`  Throughput          : ${throughput} req/s`);

  if (rt.length > 0) {
    console.log(`\n  ⏱️  Response Time (ms):`);
    console.log(`    avg : ${avgRT}`);
    console.log(`    p50 : ${p50}`);
    console.log(`    p95 : ${p95}`);
    console.log(`    p99 : ${p99}`);
    console.log(`    min : ${rt[0]}`);
    console.log(`    max : ${rt[rt.length - 1]}`);
  } else {
    console.log(`\n  ⏱️  Response Time     : tidak terukur`);
  }

  console.log(`  Durasi aktual       : ${elapsed}s`);

  return {
    phase: phase.name,
    created: total,
    successes: stats.successes,
    errors: stats.errors,
    errorRate: parseFloat(errorRate),
    throughput: parseFloat(throughput),
    responseTime: { avg: avgRT, p50, p95, p99 },
  };
};

// ============================================================
// HELPER
// ============================================================
const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// MAIN
// ============================================================
console.log("╔════════════════════════════════════════════════════╗");
console.log("║       SPIKE TEST v5 - BUS TRACKING REST API        ║");
console.log(`║  Target  : ${SERVER}${ENDPOINT.padEnd(30)}║`);
console.log("║  Metrik  : Response Time, Error Rate, Throughput    ║");
console.log("╚════════════════════════════════════════════════════╝");

const allResults = [];

for (let i = 0; i < PHASES.length; i++) {
  const result = await runPhase(PHASES[i]);
  allResults.push(result);

  if (i < PHASES.length - 1) {
    console.log(`\n⏳ Jeda 3 detik sebelum fase berikutnya...`);
    await sleep(3_000);
  }
}

// ============================================================
// RINGKASAN AKHIR
// ============================================================
console.log(`\n${"═".repeat(78)}`);
console.log("📋 RINGKASAN AKHIR SPIKE TEST v5");
console.log(`${"═".repeat(78)}`);
console.log(
  `${"Fase".padEnd(32)} ${"Req".padStart(5)} ${"Succ".padStart(5)} ${"Err%".padStart(6)} ${"Tput(r/s)".padStart(10)} ${"p50".padStart(6)} ${"p95".padStart(6)} ${"p99".padStart(6)}`,
);
console.log("─".repeat(78));
for (const r of allResults) {
  const rt = r.responseTime;
  console.log(
    `${r.phase.padEnd(32)}` +
      `${String(r.created).padStart(5)} ` +
      `${String(r.successes).padStart(5)} ` +
      `${(r.errorRate + "%").padStart(6)} ` +
      `${(r.throughput + "r/s").padStart(10)} ` +
      `${(rt.p50 != null ? rt.p50 + "ms" : "N/A").padStart(6)} ` +
      `${(rt.p95 != null ? rt.p95 + "ms" : "N/A").padStart(6)} ` +
      `${(rt.p99 != null ? rt.p99 + "ms" : "N/A").padStart(6)}`,
  );
}
console.log(`${"═".repeat(78)}`);
console.log("\n📌 Keterangan:");
console.log("   Req         = requests yang dibuat");
console.log("   Succ        = requests yang berhasil");
console.log("   Err%        = % requests yang gagal");
console.log("   Tput(r/s)   = requests per detik yang berhasil");
console.log("   p50/p95/p99 = response time persentil (ms) — makin kecil makin baik");
console.log("\n✅ Spike test selesai.\n");

  // Log progress tiap 10 detik
  const logInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
    const avgLat = stats.latencies.length
      ? Math.round(
          stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length,
        )
      : "-";
    process.stdout.write(
      `   ⏱  ${String(elapsed).padStart(3)}s` +
        ` | concurrent: ${String(concurrentActive).padStart(4)}` +
        ` | events: ${String(stats.eventsReceived).padStart(6)}` +
        ` | avg latency: ${String(avgLat).padStart(5)}ms` +
        ` | errors: ${stats.errors}\n`,
    );
  }, 10_000);

  // Spawn user + tunggu durasi fase secara paralel
  await Promise.all([
    spawnUsers(phase, stats, tracked),
    sleep(phase.phaseDuration * 1000),
  ]);

  clearInterval(logInterval);

  // ────────────────────────────────────────────────
  // Filter: pisahkan user yang masih aktif (carryover)
  // Gunakan flag isDone() yang di-set langsung di promise
  // ────────────────────────────────────────────────
  const remaining = tracked.filter((t) => !t.isDone());

  // ────────────────────────────────────────────────
  // HITUNG METRIK
  // ────────────────────────────────────────────────
  const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
  const lat = stats.latencies.sort((a, b) => a - b);
  const total = stats.created;

  const p50 = percentile(lat, 50);
  const p95 = percentile(lat, 95);
  const p99 = percentile(lat, 99);
  const avgLat = lat.length
    ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
    : null;

  // Error rate = gagal connect / total user baru di fase ini
  const errorRate =
    total > 0 ? ((stats.errors / total) * 100).toFixed(1) : "0.0";

  // Throughput = total event diterima / durasi fase
  const throughput = (stats.eventsReceived / parseFloat(elapsed)).toFixed(1);

  // ────────────────────────────────────────────────
  // PRINT HASIL
  // ────────────────────────────────────────────────
  console.log(`\n📊 HASIL ${phase.name.toUpperCase()}`);
  console.log(`─────────────────────────────────────────`);
  console.log(`  User baru dibuat     : ${total}`);
  console.log(`  Peak concurrent      : ${stats.peakConcurrent} user`);
  console.log(`  Carryover ke depan   : ${remaining.length} user`);
  console.log(`  ❌ Error koneksi     : ${stats.errors} (${errorRate}%)`);

  if (Object.keys(stats.errorDetail).length > 0) {
    for (const [msg, cnt] of Object.entries(stats.errorDetail)) {
      console.log(`     └─ [${cnt}x] ${msg}`);
    }
  }

  console.log(`\n  📨 Events diterima   : ${stats.eventsReceived}`);
  console.log(`  Throughput           : ${throughput} events/s`);

  if (lat.length > 0) {
    console.log(`\n  ⚡ Latency (ms):`);
    console.log(`    avg : ${avgLat}`);
    console.log(`    p50 : ${p50}`);
    console.log(`    p95 : ${p95}`);
    console.log(`    p99 : ${p99}`);
    console.log(`    min : ${lat[0]}`);
    console.log(`    max : ${lat[lat.length - 1]}`);
  } else {
    console.log(`\n  ⚡ Latency           : tidak terukur`);
    console.log(
      `     └─ Pastikan server menyertakan field 'server_time' di payload broadcast`,
    );
  }

  console.log(`  Durasi aktual        : ${elapsed}s`);

  return {
    result: {
      phase: phase.name,
      created: total,
      peakConcurrent: stats.peakConcurrent,
      errors: stats.errors,
      errorRate: parseFloat(errorRate),
      throughput: parseFloat(throughput),
      eventsReceived: stats.eventsReceived,
      latency: { avg: avgLat, p50, p95, p99 },
    },
    remaining, // array of { promise, isDone }
  };
};

// ============================================================
// HELPER
// ============================================================
const percentile = (sorted, p) => {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// MAIN
// ============================================================
console.log("╔════════════════════════════════════════════════════╗");
console.log("║       SPIKE TEST v4 - BUS TRACKING SERVER          ║");
console.log(`║  Target  : ${SERVER.padEnd(41)}║`);
console.log("║  Metrik  : Latency, Error Rate, Throughput          ║");
console.log("╚════════════════════════════════════════════════════╝");

const allResults = [];
let carryover = []; // array of { promise, isDone }

for (let i = 0; i < PHASES.length; i++) {
  const { result, remaining } = await runPhase(PHASES[i], carryover);
  allResults.push(result);
  carryover = remaining;

  if (i < PHASES.length - 1) {
    console.log(`\n⏳ Jeda 3 detik sebelum fase berikutnya...`);
    await sleep(3_000);
  }
}

// Tunggu semua user carryover terakhir selesai disconnect
if (carryover.length > 0) {
  console.log(`\n⏳ Menunggu ${carryover.length} user terakhir disconnect...`);
  await Promise.all(carryover.map((t) => t.promise));
}

// ============================================================
// RINGKASAN AKHIR
// ============================================================
console.log(`\n${"═".repeat(78)}`);
console.log("📋 RINGKASAN AKHIR SPIKE TEST v4");
console.log(`${"═".repeat(78)}`);
console.log(
  `${"Fase".padEnd(32)} ${"New".padStart(5)} ${"Peak".padStart(6)} ${"Err%".padStart(6)} ${"Tput(e/s)".padStart(10)} ${"p50".padStart(6)} ${"p95".padStart(6)} ${"p99".padStart(6)}`,
);
console.log("─".repeat(78));
for (const r of allResults) {
  const lat = r.latency;
  console.log(
    `${r.phase.padEnd(32)}` +
      `${String(r.created).padStart(5)} ` +
      `${String(r.peakConcurrent).padStart(6)} ` +
      `${(r.errorRate + "%").padStart(6)} ` +
      `${(r.throughput + "e/s").padStart(10)} ` +
      `${(lat.p50 != null ? lat.p50 + "ms" : "N/A").padStart(6)} ` +
      `${(lat.p95 != null ? lat.p95 + "ms" : "N/A").padStart(6)} ` +
      `${(lat.p99 != null ? lat.p99 + "ms" : "N/A").padStart(6)}`,
  );
}
console.log(`${"═".repeat(78)}`);
console.log("\n📌 Keterangan:");
console.log("   New         = user baru yang di-spawn di fase ini");
console.log("   Peak        = puncak concurrent user aktif bersamaan");
console.log("   Err%        = % koneksi gagal dari user baru di fase ini");
console.log("   Tput(e/s)   = events per detik yang diterima seluruh client");
console.log("   p50/p95/p99 = latency persentil (ms) — makin kecil makin baik");
console.log("\n✅ Spike test selesai.\n");
