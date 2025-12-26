import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import PassengerHistory from "../api/models/PassengerHistory.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.on("connect", () => {
  console.log("✅ Terhubung ke MQTT Broker");
  client.subscribe("syifa/tracking/bus/#");
});

client.on("message", async (topic, message) => {
  const topicParts = topic.split("/");
  // Format topik: syifa/tracking/bus/{id}/location
  if (topicParts.length < 5) return;

  const bus_id = parseInt(topicParts[3]);
  const messageType = topicParts[4];

  if (isNaN(bus_id)) return;

  try {
    const payload = message.toString();
    const data = JSON.parse(payload);
    const now = new Date();

    // Pastikan kita menangkap tipe pesan 'location'
    if (messageType === "location") {
      // Ambil data penumpang dari payload Python
      const { latitude, longitude, speed, passenger_count } = data;

      // 1. Ambil data bus di DB (untuk fallback jika passenger_count tidak dikirim)
      const currentBus = await Bus.findByPk(bus_id);
      const currentPassengerDB = currentBus ? currentBus.penumpang : 0;
      
      // Gunakan data dari Python jika ada, jika tidak pakai data lama
      const finalPassengerCount = (passenger_count !== undefined) 
        ? passenger_count 
        : currentPassengerDB;

      // 2. Logika Jarak Halte
      const nextHalteId = 1; 
      let jarakMeter = 0;
      let etaDetik = 0;
      const halte = await Halte.findByPk(nextHalteId);
      if (halte) {
        jarakMeter = calculateDistance(latitude, longitude, halte.latitude, halte.longitude);
        const speedMps = (speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      // 3. Update Tabel Bus (Status Realtime)
      // ✅ Perintah ini akan mengupdate lokasi DAN jumlah penumpang di tabel Bus
      await Bus.update(
        {
          latitude,
          longitude,
          speed: speed || 0,
          penumpang: finalPassengerCount, // Update kolom penumpang
          terakhir_dilihat: now,
          next_halte_id: nextHalteId,
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
          status: 'berjalan'
        },
        { where: { id_bus: bus_id } }
      );

      // 4. Buat History Baru (LOG)
      // ✅ Gunakan CREATE, bukan UPDATE, agar data tracking history bertambah terus
      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: finalPassengerCount, // Simpan log penumpang
        created_at: now,
        updated_at: now,
      });

      // 5. Kirim Socket ke Frontend
      // ✅ Frontend menerima paket lengkap: Lokasi + Penumpang
      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed,
        passenger_count: finalPassengerCount,
        eta_seconds: etaDetik,
        updated_at: now,
        status: 'berjalan'
      });

      console.log(`📍 Bus ${bus_id} Updated | Penumpang: ${finalPassengerCount}`);
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;