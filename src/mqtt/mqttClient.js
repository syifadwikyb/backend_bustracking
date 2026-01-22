import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371e3; // meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.on("connect", () => {
  console.log("✅ Terhubung ke MQTT Broker");
  client.subscribe("syifa/tracking/bus/#", () => {
    console.log("📡 Subscribe: syifa/tracking/bus/#");
  });
});

client.on("message", async (topic, message) => {
  const topicParts = topic.split("/");
  // Format: syifa/tracking/bus/{id}/location
  if (topicParts.length < 5) return;

  const bus_id = Number(topicParts[3]);
  const messageType = topicParts[4];

  if (!Number.isInteger(bus_id)) return;

  try {
    const data = JSON.parse(message.toString());
    const now = new Date();

    if (messageType === "location") {
      const { latitude, longitude, speed, passenger_count } = data;

      // Validasi koordinat
      if (latitude == null || longitude == null) return;

      // 1️⃣ Cek apakah bus ada di database
      const bus = await Bus.findByPk(bus_id);
      if (!bus) {
        // console.warn(`⚠️ Bus ${bus_id} tidak terdaftar di database.`);
        return;
      }

      // 2️⃣ Tentukan jumlah penumpang (Gunakan data lama jika sensor tidak kirim)
      const PassengerCount = Number.isInteger(passenger_count)
        ? passenger_count
        : bus.penumpang;

      // 3️⃣ LOGIKA PENCARIAN HALTE TERDEKAT (DINAMIS) [PERBAIKAN DISINI]
      // Ambil semua daftar halte dari database
      const allHalte = await Halte.findAll({
        attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
      });

      let nearestHalte = null;
      let minDistance = Infinity;

      // Loop semua halte untuk mencari yang jaraknya paling kecil
      allHalte.forEach((h) => {
        const dist = calculateDistance(
          latitude,
          longitude,
          parseFloat(h.latitude),
          parseFloat(h.longitude),
        );

        if (dist < minDistance) {
          minDistance = dist;
          nearestHalte = h;
        }
      });

      // Siapkan variabel untuk update DB
      let nextHalteId = null;
      let jarakMeter = 0;
      let etaDetik = 0;

      // Jika halte terdekat ditemukan
      if (nearestHalte) {
        nextHalteId = nearestHalte.id_halte; // Mengambil ID valid dari DB (misal: 12)
        jarakMeter = minDistance;

        // Hitung ETA (Estimasi Waktu Tiba)
        // Jika speed < 1 km/h atau 0, anggap 20 km/h agar tidak divide by zero
        const speedMps = (speed && speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      // 4️⃣ UPDATE STATE BUS (Realtime)
      await Bus.update(
        {
          latitude,
          longitude,
          speed: speed || 0,
          penumpang: PassengerCount,
          terakhir_dilihat: now,
          next_halte_id: nextHalteId, // ✅ Aman (ID Valid atau Null)
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
          status: "berjalan",
        },
        { where: { id_bus: bus_id } },
      );

      // 5️⃣ SIMPAN LOG TRACKING (History)
      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: PassengerCount,
        created_at: now,
        updated_at: now,
      });

      // 6️⃣ KIRIM UPDATE KE FRONTEND VIA WEBSOCKET
      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: PassengerCount,
        next_halte_id: nextHalteId,
        distance: jarakMeter,
        eta_seconds: etaDetik,
        status: "berjalan",
        updated_at: now,
      });

      console.log(
        `📍 Bus ${bus_id} | Penumpang: ${PassengerCount} | Halte Tujuan: ${nearestHalte ? nearestHalte.nama_halte : "-"} (${jarakMeter}m)`,
      );
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;
