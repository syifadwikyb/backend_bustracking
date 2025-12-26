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
    const data = JSON.parse(message.toString());
    const now = new Date();

    // ============================
    // LOCATION UPDATE
    // ============================
    if (messageType === "location") {
      const { latitude, longitude, speed } = data;

      // sementara: halte tujuan dummy
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
        const speedMps = (speed > 1 ? speed : 20) / 3.6;
        etaDetik = Math.round(jarakMeter / speedMps);
      }

      const [updated] = await Bus.update(
        {
          latitude,
          longitude,
          terakhir_dilihat: now,
          next_halte_id: halte ? nextHalteId : null,
          distance_to_next_halte: jarakMeter,
          eta_seconds: etaDetik,
        },
        {
          where: { id_bus: bus_id },
        }
      );

      if (!updated) {
        console.warn(`⚠️ Bus ${bus_id} tidak ditemukan`);
        return;
      }

      // ===== Tracking History =====
      const history = await TrackingHistory.findOne({
        where: { bus_id },
      });

      if (history) {
        await history.update({
          latitude,
          longitude,
          speed: speed || 0,
          updated_at: now,
        });
      } else {
        await TrackingHistory.create({
          bus_id,
          latitude,
          longitude,
          speed: speed || 0,
        });
      }

      emitBusUpdate({
        bus_id,
        latitude,
        longitude,
        speed,
        eta_seconds: etaDetik,
        updated_at: now,
      });

      console.log(`📍 Bus ${bus_id} bergerak`);
    }

    // ============================
    // PASSENGER UPDATE
    // ============================
    if (messageType === "passengers") {
      const { passenger_count } = data;

      await Bus.update(
        {
          penumpang: passenger_count,
          terakhir_dilihat: now,
        },
        { where: { id_bus: bus_id } }
      );

      await PassengerHistory.create({
        bus_id,
        jumlah_penumpang: passenger_count,
      });

      emitPassengerUpdate({
        id_bus: bus_id,
        passenger_count,
      });

      console.log(`👥 Bus ${bus_id} penumpang: ${passenger_count}`);
    }
  } catch (err) {
    console.error("❌ MQTT Error:", err.message);
  }
});

export default client;
