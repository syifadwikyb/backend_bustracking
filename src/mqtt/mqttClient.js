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
  if (topicParts.length < 5) return;

  const bus_id = parseInt(topicParts[3]);
  const messageType = topicParts[4];

  if (isNaN(bus_id)) return;

  try {
    const payload = message.toString();
    const data = JSON.parse(payload);
    const now = new Date();

    if (messageType === "location") {
      const { latitude, longitude, speed, passenger_count } = data;

      const currentBus = await Bus.findByPk(bus_id);
      const currentPassengerDB = currentBus ? currentBus.penumpang : 0;
      
      const PassengerCount = (passenger_count !== undefined) 
        ? passenger_count 
        : currentPassengerDB;

      const nextHalteId = 1; 
      let jarakMeter = 0;
      let etaDetik = 0;
      const halte = await Halte.findByPk(nextHalteId);
      if (halte) {
        jarakMeter = calculateDistance(latitude, longitude, halte.latitude, halte.longitude);
        const speedMps = (speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

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
          status: 'berjalan'
        },
        { where: { id_bus: bus_id } }
      );

      await TrackingHistory.create({
        bus_id,
        latitude,
        longitude,
        speed: speed || 0,
        passenger_count: PassengerCount,
        created_at: now,
        updated_at: now,
      });

      // ✅ EMIT LENGKAP KE FRONTEND
      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed,
        passenger_count: PassengerCount, // Pastikan ini ada!
        eta_seconds: etaDetik,
        updated_at: now,
        status: 'berjalan'
      });

      console.log(`📍 Bus ${bus_id} Updated | Penumpang: ${PassengerCount}`);
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;