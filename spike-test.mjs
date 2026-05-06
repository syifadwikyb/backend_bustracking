/**
 * ============================================================
 * SPIKE TEST v4 - Bus Tracking Server
 *
 * Metrik utama:
 *   - Latency  : selisih timestamp server kirim vs client terima
 *   - Error Rate: % koneksi gagal
 *   - Throughput: event per detik yang diterima semua client
 *
 * Skenario:
 *   Fase 1 - Baseline : +60 user dalam 60 detik
 *   Fase 2 - Spike 1  : +500 user dalam 10 detik
 *   Fase 3 - Spike 2  : +500 user dalam 2 menit
 *   Fase 4 - Recovery : +60 user dalam 60 detik
 *
 * Jalankan: node spike-test-v4.mjs
 * ============================================================
 */

import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

// ============================================================
// KONFIGURASI FASE
// spawnTotal   = jumlah user baru di fase ini
// spawnOver    = waktu penyebaran spawn (detik)
// dwellTime    = lama user tetap connect setelah berhasil masuk
// phaseDuration= lama fase berjalan (detik)
// spawnBatch   = berapa user per gelombang (default 5)
// ============================================================
const PHASES = [
  {
    name: "Fase 1 - Baseline",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,     // 1 user/detik selama 60 detik
    dwellTime: 120,    // tetap connect melewati fase berikutnya
    spawnBatch: 5,
  },
  {
    name: "Fase 2 - Spike 1 (Extreme)",
    phaseDuration: 10,
    spawnTotal: 500,
    spawnOver: 10,     // 50 user/detik selama 10 detik
    dwellTime: 180,    // tetap connect melewati fase 3 dan 4
    spawnBatch: 20,    // 20 user per gelombang tiap 400ms
  },
  {
    name: "Fase 3 - Spike 2 (Sustained)",
    phaseDuration: 120,
    spawnTotal: 500,
    spawnOver: 120,    // ~4 user/detik selama 2 menit
    dwellTime: 120,
    spawnBatch: 5,
  },
  {
    name: "Fase 4 - Recovery",
    phaseDuration: 60,
    spawnTotal: 60,
    spawnOver: 60,     // 1 user/detik selama 60 detik
    dwellTime: 60,
    spawnBatch: 5,
  },
];

// ============================================================
// STATE GLOBAL
// ============================================================
let concurrentActive = 0;
let totalCreated = 0;

// ============================================================
// SATU USER — hanya listen broadcast, ukur latency
// Mengembalikan { promise, isDone }
// ============================================================
const runUser = (userId, dwellTime, stats) => {
  // Flag eksplisit: sudah selesai atau belum
  let done = false;

  const promise = new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 10_000,
      forceNew: true,
    });

    // Timeout global — jaga-jaga jika dwell + overhead melebihi batas
    const globalTimeout = setTimeout(() => {
      stats.errors++;
      stats.errorDetail["connection timeout"] =
        (stats.errorDetail["connection timeout"] || 0) + 1;
      socket.disconnect();
      done = true;
      resolve();
    }, (dwellTime + 15) * 1000);

    socket.on("connect", () => {
      concurrentActive++;
      if (concurrentActive > stats.peakConcurrent) {
        stats.peakConcurrent = concurrentActive;
      }

      // Join room agar menerima broadcast bus
      socket.emit("join_bus_room", 1);

      // Ukur latency dari server_time yang dikirim server
      socket.on("bus_location_update", (data) => {
        if (data?.server_time) {
          const latency = Date.now() - data.server_time;
          // Hanya catat latency yang masuk akal (0 – 30 detik)
          if (latency >= 0 && latency < 30_000) {
            stats.latencies.push(latency);
          }
        }
        stats.eventsReceived++;
      });

      // Disconnect bersih setelah dwellTime
      setTimeout(() => {
        clearTimeout(globalTimeout);
        concurrentActive = Math.max(0, concurrentActive - 1);
        socket.disconnect();
        done = true;
        resolve();
      }, dwellTime * 1000);
    });

    socket.on("connect_error", (err) => {
      stats.errors++;
      stats.errorDetail[err.message] =
        (stats.errorDetail[err.message] || 0) + 1;
      clearTimeout(globalTimeout);
      done = true;
      resolve();
    });
  });

  // Kembalikan promise beserta fungsi pemeriksa status
  return { promise, isDone: () => done };
};

// ============================================================
// SPAWN USER BERTAHAP
// ============================================================
const spawnUsers = async (phase, stats, tracked) => {
  if (phase.spawnTotal === 0) return;

  const batchSize = phase.spawnBatch || 5;
  const totalBatches = Math.ceil(phase.spawnTotal / batchSize);
  const batchIntervalMs = (phase.spawnOver * 1000) / totalBatches;

  for (let b = 0; b < totalBatches; b++) {
    const count = Math.min(batchSize, phase.spawnTotal - b * batchSize);
    for (let i = 0; i < count; i++) {
      stats.created++;
      totalCreated++;
      tracked.push(runUser(totalCreated, phase.dwellTime, stats));
    }
    if (b < totalBatches - 1) await sleep(batchIntervalMs);
  }
};

// ============================================================
// JALANKAN SATU FASE
// ============================================================
const runPhase = async (phase, carryover = []) => {
  console.log(`\n${"=".repeat(62)}`);
  console.log(`🚀 ${phase.name}`);
  console.log(`   Durasi fase  : ${phase.phaseDuration}s`);
  if (phase.spawnTotal > 0) {
    const rate = (phase.spawnTotal / phase.spawnOver).toFixed(1);
    console.log(
      `   User baru   : ${phase.spawnTotal} user dalam ${phase.spawnOver}s (~${rate} user/s)`,
    );
    console.log(`   Dwell time  : ${phase.dwellTime}s`);
  } else {
    console.log(`   User baru   : 0 (hanya carryover)`);
  }
  console.log(
    `   Carryover   : ${carryover.length} user aktif dari fase sebelumnya`,
  );
  console.log(`${"=".repeat(62)}`);

  const stats = {
    created: 0,
    errors: 0,
    eventsReceived: 0,
    peakConcurrent: concurrentActive,
    latencies: [],
    errorDetail: {},
  };

  const phaseStart = Date.now();

  // tracked = array of { promise, isDone }
  // Mulai dengan carryover dari fase sebelumnya
  const tracked = [...carryover];

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
