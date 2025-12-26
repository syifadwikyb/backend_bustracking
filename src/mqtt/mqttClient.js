import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import PassengerHistory from "../api/models/PassengerHistory.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

/**
 * Hitung jarak koordinat (Haversine Formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371e3; // Radius bumi dalam meter
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ============================
// MQTT CONNECTION
// ============================
const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.on("connect", () => {
  console.log("✅ Terhubung ke MQTT Broker");
  client.subscribe("syifa/tracking/bus/#", (err) => {
    if (!err) console.log("📡 Subscribed: syifa/tracking/bus/#");
  });
});

// ============================
// MQTT MESSAGE HANDLER
// ============================
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

    // =======================================================
    // LOGIKA TUNGGAL: LOCATION (Include Passenger Data)
    // =======================================================
    if (messageType === "location") {
      // Data yang diharapkan dari Python: { latitude, longitude, speed, passenger_count }
      const { latitude, longitude, speed, passenger_count } = data;

      // 1. Ambil data bus saat ini dari DB
      const currentBus = await Bus.findByPk(bus_id);
      
      // Fallback: Jika passenger_count tidak dikirim hardware, pakai data lama dari DB
      const currentPassengerDB = currentBus ? currentBus.penumpang : 0;
      const finalPassengerCount = (passenger_count !== undefined) ? passenger_count : currentPassengerDB;

      // 2. Hitung Jarak ke Halte Berikutnya (Contoh ID 1)
      // Nanti logika 'nextHalteId' bisa dibuat dinamis berdasarkan rute
      const nextHalteId = 1; 
      let jarakMeter = 0;
      let etaDetik = 0;

      const halte = await Halte.findByPk(nextHalteId);
      if (halte) {
        jarakMeter = calculateDistance(
          latitude,
          longitude,
          halte.latitude,
          halte.longitude
        );
        // Asumsi kecepatan minimal 20 km/h jika speed 0/kecil
        const speedMps = (speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      // 3. Update Tabel BUS (Data Realtime Utama)
      const [updated] = await Bus.update(
        {
          latitude,
          longitude,
          speed: speed || 0,
          penumpang: finalPassengerCount, // Update jumlah penumpang
          terakhir_dilihat: now,
          next_halte_id: halte ? nextHalteId : null,
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
          status: 'berjalan' // Otomatis set berjalan jika ada update lokasi
        },
        { where: { id_bus: bus_id } }
      );

      if (!updated) {
        console.warn(`⚠️ Bus ${bus_id} tidak ditemukan di database.`);
        return;
      }

      // 4. Simpan ke Tracking History (Log Perjalanan)
      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: finalPassengerCount, // Simpan log penumpang di titik ini
        created_at: now,
        updated_at: now,
      });

      // 5. Simpan ke Passenger History (Hanya jika jumlah berubah)
      // Ini agar tabel passenger_history tidak penuh dengan data duplikat
      if (currentBus && currentBus.penumpang !== finalPassengerCount) {
         await PassengerHistory.create({
            bus_id,
            jumlah_penumpang: finalPassengerCount,
            created_at: now
         });
         console.log(`📝 Passenger History Updated: ${finalPassengerCount}`);
      }

      // 6. Kirim Data Lengkap ke Frontend via Socket
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

      console.log(
        `📍 Bus ${bus_id} | Lat: ${latitude} | Lon: ${longitude} | 👥 Penumpang: ${finalPassengerCount}`
      );
    }

  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;