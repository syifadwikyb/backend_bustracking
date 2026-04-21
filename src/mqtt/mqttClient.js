import mqtt from "mqtt";
import fetch from "node-fetch";
import { emitBusLocation } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Schedule from "../api/models/Schedule.js";
import Jalur from "../api/models/Jalur.js";
import Halte from "../api/models/Halte.js";
import { getEtaFromML } from "../api/controllers/EtaController.js";
import dotenv from "dotenv";

dotenv.config();

const CACHE_DURATION = 10 * 60 * 1000; // interval cache
console.log("API_URL:", process.env.API_URL);

// cache data halte di memory
let cachedHalte = [];

// menyimpan riwayat kecepatan bus
const busSpeedBuffer = {};

// menyimpan posisi halte terakhir bus
const busTargetTracker = {};

// ambil data halte dari DB ke memory
const updateHalteCache = async () => {
  try {
    const haltes = await Halte.findAll({
      attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
      raw: true,
    });
    cachedHalte = haltes;
  } catch (err) {
    console.error("Gagal cache halte:", err.message);
  }
};

updateHalteCache();
setInterval(updateHalteCache, CACHE_DURATION);

// menghitung jarak antar koordinat (meter)
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

// menghitung rata-rata kecepatan (biar stabil)
function calculateRollingSpeed(busId, currentSpeed) {
  if (!busSpeedBuffer[busId]) busSpeedBuffer[busId] = [];

  busSpeedBuffer[busId].push(currentSpeed);

  if (busSpeedBuffer[busId].length > 3) {
    busSpeedBuffer[busId].shift(); // buang data lama
  }

  const sum = busSpeedBuffer[busId].reduce((a, b) => a + b, 0);
  return parseFloat((sum / busSpeedBuffer[busId].length).toFixed(2));
}

// koneksi ke MQTT broker
const client = mqtt.connect(process.env.MQTT_BROKER_URL);

// subscribe ke semua topik bus
client.on("connect", () => {
  client.subscribe("diptrack/tracking/bus/#");
});

// handle error koneksi
client.on("error", (err) => {
  console.error("MQTT Error:", err.message);
});

// reconnect otomatis jika putus
client.on("reconnect", () => {
  console.log("Reconnect MQTT...");
});

// menerima data dari bus
client.on("message", async (topic, message) => {
  const topicParts = topic.split("/");

  // filter hanya data lokasi
  if (topicParts.length < 5 || topicParts[4] !== "location") return;

  const bus_id = parseInt(topicParts[3]);
  if (isNaN(bus_id)) return;

  try {
    const payload = JSON.parse(message.toString());
    if (!payload.latitude || !payload.longitude) return;

    // ambil data bus + relasi
    const currentBus = await Bus.findByPk(bus_id, {
      include: [
        {
          model: Schedule,
          as: "jadwal",
          include: [
            {
              model: Jalur,
              as: "jalur",
              include: [{ model: Halte, as: "halte" }],
            },
          ],
        },
      ],
    });

    if (!currentBus) return;

    // cari jadwal aktif
    const jadwalList = Array.isArray(currentBus.jadwal)
      ? currentBus.jadwal
      : currentBus.jadwal
        ? [currentBus.jadwal]
        : [];

    const activeSchedule = jadwalList.find(
      (j) => j.status?.toLowerCase().trim() === "berjalan",
    );

    if (!activeSchedule?.jalur?.halte?.length) return;

    // ambil semua halte
    const allHaltes = [...activeSchedule.jalur.halte].reverse();

    // tentukan halte target
    let targetIndex = busTargetTracker[bus_id] || 0;
    let targetHalte = allHaltes[targetIndex];

    // hitung jarak ke halte
    let minDistance = getDistanceMeters(
      payload.latitude,
      payload.longitude,
      parseFloat(targetHalte.latitude),
      parseFloat(targetHalte.longitude),
    );

    // pindah ke halte berikutnya jika sudah dekat
    if (minDistance < 70) {
      targetIndex = (targetIndex + 1) % allHaltes.length;
      targetHalte = allHaltes[targetIndex];
    }

    busTargetTracker[bus_id] = targetIndex;

    // hitung jarak ke semua halte
    let cumulativeDistance = 0;
    const routeData = {};

    for (let step = 0; step < allHaltes.length; step++) {
      let idx = (targetIndex + step) % allHaltes.length;
      let halte = allHaltes[idx];

      if (step === 0) {
        cumulativeDistance = getDistanceMeters(
          payload.latitude,
          payload.longitude,
          parseFloat(halte.latitude),
          parseFloat(halte.longitude),
        );
      } else {
        let prev = allHaltes[(idx - 1 + allHaltes.length) % allHaltes.length];
        cumulativeDistance += getDistanceMeters(
          parseFloat(prev.latitude),
          parseFloat(prev.longitude),
          parseFloat(halte.latitude),
          parseFloat(halte.longitude),
        );
      }

      routeData[halte.id_halte] = {
        distance: cumulativeDistance,
        step,
      };
    }

    // hitung kecepatan rata-rata
    const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);
    const now = new Date();

    // kirim ke ML untuk semua halte
    const hasilSemuaEta = await Promise.all(
      allHaltes.map(async (h, i) => {
        const r = routeData[h.id_halte];

        const eta = await getEtaFromML({
          remaining_halte_count: allHaltes.length - r.step,
          distance_to_target: r.distance,
          rolling_speed_30s: rollingSpeed,
          hour_of_day: now.getHours(),
          day_of_week: now.getDay(),
        });

        return {
          halte_id: h.id_halte,
          nama_halte: h.nama_halte,
          distance_meters: r.distance,
          eta_seconds: eta,
          is_target: i === targetIndex,
        };
      }),
    );

    const targetStop = hasilSemuaEta.find((h) => h.is_target);

    // update database
    await Bus.update(
      {
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed || 0,
        terakhir_dilihat: now,
        next_halte_id: targetStop?.halte_id || null,
        eta_seconds: targetStop?.eta_seconds || null,
        status: payload.speed > 1 ? "berjalan" : "berhenti",
      },
      { where: { id_bus: bus_id } },
    );

    // kirim ke frontend (real-time)
    emitBusLocation({
      bus_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      next_halte_id: targetStop?.halte_id || null,
      nama_halte_tujuan: targetStop?.nama_halte || null,
      distance: targetStop?.distance_meters || 0,
      eta_seconds: targetStop?.eta_seconds || null,
      daftar_eta: hasilSemuaEta,
      updated_at: now,
    });

    // kirim ke REST API
    try {
      const response = await fetch(
        `${process.env.API_URL}/api/rest/bus-location`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bus_id: bus_id,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed || 0,
          }),
        },
      );

      const resJson = await response.json();
      console.log("✅ Respons dari REST API:", resJson);
    } catch (err) {
      console.error("❌ Gagal kirim ke REST API:", err.message);
    }
  } catch (err) {
    console.error("Error MQTT:", err);
  }
});

export default client;
