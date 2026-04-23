// src/ws/testing/load-test-emit.mjs
import { io } from "socket.io-client";

const SERVER = "http://145.79.15.182:5000";

const PHASES = [
  { name: "Normal",  users: 100 },
  { name: "Ramai",   users: 300 },
  { name: "Peak",    users: 500 },
];

const runUser = (userId) => {
  return new Promise((resolve) => {
    const socket = io(SERVER, {
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 10000,
    });

    socket.on("connect", () => {
      // Ukur waktu emit → response (sama seperti Artillery)
      const emitStart = Date.now();
      
      socket.emit("join_bus_room", 1, () => {
        // Callback = server acknowledge
        const responseTime = Date.now() - emitStart;
        resolve({ success: true, responseTime });
        socket.disconnect();
      });

      // Fallback kalau server tidak kirim ack
      setTimeout(() => {
        const responseTime = Date.now() - emitStart;
        resolve({ success: true, responseTime });
        socket.disconnect();
      }, 5000);
    });

    socket.on("connect_error", (err) => {
      resolve({ success: false, error: err.message });
    });
  });
};

const runPhase = async (phase) => {
  console.log(`\n🚀 Fase: ${phase.name} - ${phase.users} users`);

  const promises = Array.from({ length: phase.users }, (_, i) =>
    runUser(i + 1)
  );
  const results = await Promise.all(promises);

  const success = results.filter(r => r.success);
  const failed  = results.filter(r => !r.success);
  const times   = success.map(r => r.responseTime).sort((a, b) => a - b);

  const avg = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
  const p95 = arr => arr[Math.floor(arr.length * 0.95)];
  const p99 = arr => arr[Math.floor(arr.length * 0.99)];

  console.log(`\n===== ${phase.name.toUpperCase()} =====`);
  console.log(`Berhasil     : ${success.length}/${phase.users}`);
  console.log(`Gagal        : ${failed.length}`);
  console.log(`\nResponse Time (ms):`);
  console.log(`  min    : ${times[0]}`);
  console.log(`  max    : ${times[times.length - 1]}`);
  console.log(`  mean   : ${avg(times)}`);
  console.log(`  median : ${times[Math.floor(times.length * 0.5)]}`);
  console.log(`  p95    : ${p95(times)}`);
  console.log(`  p99    : ${p99(times)}`);

  return { phase: phase.name, success: success.length, failed: failed.length, times };
};

// Jalankan semua fase
for (const phase of PHASES) {
  await runPhase(phase);
  // Jeda antar fase
  await new Promise(r => setTimeout(r, 3000));
}

console.log("\n✅ Test selesai.");