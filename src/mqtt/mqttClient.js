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
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

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

      if (latitude == null || longitude == null) return;

      // 1️⃣ Ambil data bus saat ini
      const bus = await Bus.findByPk(bus_id);
      if (!bus) {
        console.warn(`⚠️ Bus ${bus_id} tidak ditemukan`);
        return;
      }

      // 2️⃣ Tentukan jumlah penumpang final
      const PassengerCount = Number.isInteger(passenger_count)
        ? passenger_count
        : bus.penumpang;

      // 3️⃣ Hitung jarak & ETA ke halte (contoh: halte id 1)
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
        const speedMps = (speed && speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      // 4️⃣ UPDATE BUS (REALTIME STATE)
      await Bus.update(
        {
          latitude,
          longitude,
          speed: speed || 0,
          penumpang: PassengerCount,
          terakhir_dilihat: now,
          next_halte_id: nextHalteId,
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
          status: "berjalan",
        },
        { where: { id_bus: bus_id } }
      );

      // 5️⃣ INSERT TRACKING HISTORY (LOG)
      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: PassengerCount,
        created_at: now,
        updated_at: now,
      });

      // 6️⃣ EMIT SOCKET KE FRONTEND
      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: PassengerCount,
        eta_seconds: etaDetik,
        status: "berjalan",
        updated_at: now,
      });

      console.log(
        `📍 Bus ${bus_id} | Penumpang: ${PassengerCount}`
      );
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;
