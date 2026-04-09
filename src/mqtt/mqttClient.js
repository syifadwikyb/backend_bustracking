import mqtt from "mqtt";
import { emitBusLocation } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Schedule from "../api/models/Schedule.js";
import Jalur from "../api/models/Jalur.js";
import Halte from "../api/models/Halte.js";
import { getEtaFromML } from "../api/controllers/EtaController.js";
import dotenv from 'dotenv';

dotenv.config();

// --- KONFIGURASI ---
const CACHE_DURATION = 10 * 60 * 1000; // 10 Menit

// --- MEMORY CACHE ---
let cachedHalte = [];
const busSpeedBuffer = {};
const busTargetTracker = {};

const updateHalteCache = async () => {
  try {
    const haltes = await Halte.findAll({
      attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
      raw: true,
    });
    cachedHalte = haltes;
    console.log(`✅ Cache Halte Diperbarui: ${haltes.length} halte.`);
  } catch (err) {
    console.error("❌ Gagal cache halte:", err.message);
  }
};
updateHalteCache();
setInterval(updateHalteCache, CACHE_DURATION);

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function calculateRollingSpeed(busId, currentSpeed) {
  if (!busSpeedBuffer[busId]) busSpeedBuffer[busId] = [];
  busSpeedBuffer[busId].push(currentSpeed);
  if (busSpeedBuffer[busId].length > 10) busSpeedBuffer[busId].shift();
  const sum = busSpeedBuffer[busId].reduce((a, b) => a + b, 0);
  return parseFloat((sum / busSpeedBuffer[busId].length).toFixed(2));
}

// --- MQTT CLIENT ---
// const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL;

// const client = mqtt.connect(MQTT_BROKER_URL);

// Di sisi Client-side Next.js
const BROKER_URL = 'ws://145.79.15.182:8888'; // Pakai IP VPS, bukan localhost!

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
    console.log("✅ Dashboard terhubung ke VPS!");
    // Pastikan TOPIC ini sama persis dengan yang di Simulator HP/Hardware
    client.subscribe('diptrack/tracking/bus/+/location'); 
});

// client.on("connect", () => {
//   console.log("✅ [MQTT UTAMA] Berhasil Terhubung ke Broker!");
//   client.subscribe("diptrack/tracking/bus/#", (err) => {
//     if (!err) {
//       console.log(
//         "📡 [MQTT UTAMA] Sukses Subscribe ke topik diptrack/tracking/bus/#",
//       );
//     } else {
//       console.error("❌ [MQTT UTAMA] Gagal Subscribe:", err);
//     }
//   });
// });

client.on("error", (err) => {
  console.error("❌ [MQTT UTAMA] Error Koneksi:", err.message);
});

client.on("reconnect", () => {
  console.log("🔄 [MQTT UTAMA] Mencoba terhubung kembali...");
});

client.on("message", async (topic, message) => {
  console.log(`\n======================================`);
  console.log(`📥 [MQTT] Pesan masuk di topik: ${topic}`);

  const topicParts = topic.split("/");
  if (topicParts.length < 5 || topicParts[4] !== "location") {
    return;
  }

  const bus_id = parseInt(topicParts[3]);
  if (isNaN(bus_id)) return;

  try {
    const payload = JSON.parse(message.toString());
    if (payload.latitude == null || payload.longitude == null) return;

    console.log(`🔍 [DB] Mencari bus ID ${bus_id} di tabel database...`);

    // 1. AMBIL DATA BUS BESERTA JADWAL DAN JALUR
    const currentBus = await Bus.findByPk(bus_id, {
      include: [
        {
          model: Schedule,
          as: "jadwal",
          required: false,
          include: [
            {
              model: Jalur,
              as: "jalur",
              // HANYA AMBIL HALTE YANG BENAR-BENAR BERELASI DENGAN JALUR INI
              include: [{ model: Halte, as: "halte" }],
            },
          ],
        },
      ],
    });

    if (!currentBus) {
      console.log(
        `❌ [DB] Bus dengan ID ${bus_id} TIDAK DITEMUKAN di database!`,
      );
      return;
    }

    // 2. PERBAIKAN PENCARIAN JADWAL: Pastikan formatnya array, lalu cari yang "berjalan"
    const jadwalList = Array.isArray(currentBus.jadwal)
      ? currentBus.jadwal
      : currentBus.jadwal
        ? [currentBus.jadwal]
        : [];
    const activeSchedule = jadwalList.find(
      (j) => j.status && String(j.status).toLowerCase().trim() === "berjalan",
    );

    let mlResult = { eta_seconds: null, next_halte_id: null, daftar_eta: [] };
    let minDistance = Infinity;
    let targetHalteName = null;
    let targetHalte = null;

    if (!activeSchedule) {
      // Log ini akan memberi tahu status apa yang sebenarnya terbaca
      const statusTersedia =
        jadwalList.map((j) => j.status).join(", ") || "KOSONG";
      console.log(
        `⚠️ [DB] Bus ID ${bus_id} Prediksi dilewati! (Status jadwal di DB: [${statusTersedia}])`,
      );
    } else if (
      activeSchedule.jalur?.halte &&
      activeSchedule.jalur.halte.length > 0
    ) {
      console.log(
        `✅ [DB] Jadwal aktif ditemukan (Jalur ID: ${activeSchedule.jalur.id_jalur}). Memulai ML...`,
      );

      // 3. PENGAMANAN RUTE & KUNCI ARAH
      const allHaltes = [...activeSchedule.jalur.halte].reverse();
      let startIndex = 0;

      if (busTargetTracker[bus_id] !== undefined) {
        startIndex = busTargetTracker[bus_id];
      } else if (currentBus.next_halte_id) {
        const currIdx = allHaltes.findIndex(
          (h) => h.id_halte === currentBus.next_halte_id,
        );
        if (currIdx !== -1) {
          startIndex = currIdx;
        }
      }

      let targetIndex = startIndex;
      let targetHalte = allHaltes[targetIndex];

      let minDistance = getDistanceMeters(
        payload.latitude,
        payload.longitude,
        parseFloat(targetHalte.latitude),
        parseFloat(targetHalte.longitude),
      );

      // LOGIKA CHECK-IN (Radius 70 meter)
      if (minDistance < 70) {
        targetIndex += 1;
        if (targetIndex >= allHaltes.length) {
          targetIndex = 0; // Looping kembali ke halte pertama
        }
        targetHalte = allHaltes[targetIndex];
        minDistance = getDistanceMeters(
          payload.latitude,
          payload.longitude,
          parseFloat(targetHalte.latitude),
          parseFloat(targetHalte.longitude),
        );
      }

      busTargetTracker[bus_id] = targetIndex;
      console.log(
        `📍 [INFO] Halte tujuan: ${targetHalte?.nama_halte} (Jarak: ${Math.round(minDistance)}m)`,
      );

      // --- SISTEM LOOPING VIRTUAL (URUTAN TETAP STATIS) ---
      if (allHaltes.length > 0) {
        targetHalteName = targetHalte.nama_halte;
        let cumulativeDistance = 0;
        const routeData = {};

        // Menghitung jarak rute memutar, dimulai dari halte target saat ini
        for (let step = 0; step < allHaltes.length; step++) {
          let currentIndex = (targetIndex + step) % allHaltes.length;
          let currentH = allHaltes[currentIndex];

          if (step === 0) {
            cumulativeDistance = getDistanceMeters(
              payload.latitude,
              payload.longitude,
              parseFloat(currentH.latitude),
              parseFloat(currentH.longitude),
            );
          } else {
            let prevIndex = (targetIndex + step - 1) % allHaltes.length;
            let prevH = allHaltes[prevIndex];
            cumulativeDistance += getDistanceMeters(
              parseFloat(prevH.latitude),
              parseFloat(prevH.longitude),
              parseFloat(currentH.latitude),
              parseFloat(currentH.longitude),
            );
          }
          // Simpan jarak dan sisa langkah berdasarkan ID Halte
          routeData[currentH.id_halte] = {
            distance: cumulativeDistance,
            step: step,
          };
        }

        const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);
        const now = new Date();

        // Memproses ML dengan urutan ASLI yang statis
        const mlPromises = allHaltes.map(async (h, i) => {
          const rData = routeData[h.id_halte];
          const mlPayload = {
            remaining_halte_count: allHaltes.length - rData.step,
            distance_to_target: rData.distance,
            rolling_speed_30s: rollingSpeed,
            hour_of_day: now.getHours(),
            day_of_week: now.getDay(),
          };

          const prediksiEtaDetik = await getEtaFromML(mlPayload);

          return {
            halte_id: h.id_halte,
            nama_halte: h.nama_halte,
            distance_meters: rData.distance,
            eta_seconds: prediksiEtaDetik,
            is_target: i === targetIndex, // 👈 INI FLAG UNTUK TITIK BIRU DI FRONTEND
          };
        });

        const hasilSemuaEta = await Promise.all(mlPromises);

        if (hasilSemuaEta.length > 0) {
          // Ambil ETA dari halte yang sedang menjadi target
          const targetEtaObj = hasilSemuaEta[targetIndex];
          mlResult.eta_seconds = targetEtaObj ? targetEtaObj.eta_seconds : null;
          mlResult.next_halte_id = targetHalte.id_halte;
        }

        mlResult.daftar_eta = hasilSemuaEta;
      }
    } else {
      console.log(
        `⚠️ [DB] Bus ID ${bus_id} dilewati! Jalur yang dipilih (ID: ${activeSchedule.jalur?.id_jalur || "?"}) BELUM MEMILIKI HALTE.`,
      );
    }

    const now = new Date();
    const finalPassenger = payload.passenger_count ?? currentBus.penumpang;

    console.log(
      `💾 [DB] Update posisi bus ID ${bus_id} (Tanpa simpan history)...`,
    );

    // Kita HANYA mengupdate tabel 'Bus' agar koordinatnya berubah di database,
    // sehingga tabel tracking_history tidak akan bertambah lagi.
    await Bus.update(
      {
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed || 0,
        penumpang: finalPassenger,
        terakhir_dilihat: now,
        next_halte_id: targetHalte ? targetHalte.id_halte : null,
        distance_to_next_halte:
          minDistance === Infinity || isNaN(minDistance) ? 0 : minDistance,
        eta_seconds: mlResult.eta_seconds,
        status: payload.speed > 1 ? "berjalan" : "berhenti",
      },
      { where: { id_bus: bus_id } },
    );

    const targetStop = mlResult.daftar_eta.find(h => h.is_target === true);
    // 5. KIRIM KE FRONTEND LEWAT SOCKET (REAL-TIME)
    emitBusLocation({
      bus_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      passenger_count: finalPassenger,
      next_halte_id: targetStop ? targetStop.halte_id : null,
      nama_halte_tujuan: targetStop ? targetStop.nama_halte : "Rute Berakhir",
      distance: targetStop ? targetStop.distance_meters : 0,
      eta_seconds: targetStop ? targetStop.eta_seconds : null,
      daftar_eta: mlResult.daftar_eta || [],
      updated_at: now,
    });

    console.log(`✅ [SELESAI] Data bus ${bus_id} berhasil diproses!`);
    console.log(`======================================\n`);
  } catch (err) {
    console.error("❌ [ERROR] Terjadi kesalahan MQTT:", err);
  }
});

export default client;
