import mqtt from "mqtt";
import { emitBusUpdate, emitPassengerUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import PassengerHistory from "../api/models/PassengerHistory.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

/**
 * Hitung jarak koordinat (Haversine)
 */
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
  if (topicParts.length < 5) return;

  const bus_id = parseInt(topicParts[3]);
  const messageType = topicParts[4];
  if (isNaN(bus_id)) return;

  try {
    const payload = message.toString();
    const data = JSON.parse(payload);
    const now = new Date();

    // ============================
    // 1. LOCATION UPDATE
    // ============================
    if (messageType === "location") {
      const { latitude, longitude, speed } = data;

      // Ambil data bus saat ini untuk mendapatkan jumlah penumpang terakhir
      const currentBus = await Bus.findByPk(bus_id);
      const currentPassengerCount = currentBus ? currentBus.penumpang : 0;

      // --- Logika Jarak & Halte ---
      const nextHalteId = 1; // Logic dinamis bisa ditambahkan disini
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
        const speedMps = (speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      // --- Update Tabel Bus ---
      const [updated] = await Bus.update(
        {
          latitude,
          longitude,
          terakhir_dilihat: now,
          next_halte_id: halte ? nextHalteId : null,
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
        },
        { where: { id_bus: bus_id } }
      );

      if (!updated) {
        console.warn(`⚠️ Bus ${bus_id} tidak ditemukan`);
        return;
      }

      // --- Simpan Tracking History (Termasuk Penumpang) ---
      // Kita gunakan .create() agar tersimpan sebagai history perjalanan (log)
      // Jika ingin hanya menyimpan 1 history terakhir, gunakan logika findOne/update seperti sebelumnya.
      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: currentPassengerCount, // 👈 Masukkan data penumpang ke history lokasi
        created_at: now,
        updated_at: now,
      });

      // --- Emit Socket ---
      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed,
        passenger_count: currentPassengerCount,
        eta_seconds: etaDetik,
        updated_at: now,
      });

      console.log(
        `📍 Bus ${bus_id} bergerak | Penumpang: ${currentPassengerCount}`
      );
    }

    // ============================
    // 2. PASSENGER UPDATE (AI DETECT)
    // ============================
    // Payload AI diharapkan: { "action": "in" } atau { "action": "out" }
    else if (messageType === "passengers") {
      const bus = await Bus.findByPk(bus_id);
      if (!bus) return;

      let newPassengerCount = bus.penumpang;
      let changeAmount = 0;

      // Logika Tambah/Kurang Penumpang
      if (data.action === "in") {
        newPassengerCount += 1;
        changeAmount = 1;
      } else if (data.action === "out") {
        newPassengerCount -= 1;
        changeAmount = -1;
      } else if (data.passenger_count !== undefined) {
        // Fallback jika hardware mengirim total langsung
        newPassengerCount = data.passenger_count;
      }

      // Validasi agar tidak minus
      if (newPassengerCount < 0) newPassengerCount = 0;

      // 1. Update Tabel Bus (Data Real-time)
      await bus.update({
        penumpang: newPassengerCount,
        terakhir_dilihat: now,
      });

      // 2. Simpan Riwayat Penumpang (Untuk Statistik Naik/Turun)
      await PassengerHistory.create({
        bus_id,
        jumlah_penumpang: newPassengerCount,
        // (Opsional) Anda bisa menambahkan kolom 'perubahan' di tabel PassengerHistory
        // untuk mencatat +1 atau -1 jika diperlukan untuk analitik
        created_at: now,
      });

      // 3. Simpan Tracking History (Snapshot saat penumpang naik/turun)
      // Ini penting agar di peta history terlihat di titik mana penumpang berubah
      await TrackingHistory.create({
        bus_id,
        latitude: bus.latitude, // Gunakan lokasi terakhir bus
        longitude: bus.longitude,
        speed: 0, // Biasanya bus berhenti saat penumpang naik/turun
        passenger_count: newPassengerCount, // 👈 Data baru tersimpan di history
        created_at: now,
        updated_at: now,
      });

      // 4. Emit Socket ke Frontend
      emitPassengerUpdate({
        id_bus: bus_id,
        passenger_count: newPassengerCount,
        action: data.action, // Kirim info "in" atau "out" agar frontend bisa kasih animasi
      });

      console.log(
        `👥 Bus ${bus_id} Passenger: ${data.action} | Total: ${newPassengerCount}`
      );
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;
