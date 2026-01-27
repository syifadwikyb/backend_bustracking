import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

// --- CACHING DATA HALTE ---
let cachedHalte = [];
const updateHalteCache = async () => {
    try {
        const haltes = await Halte.findAll({
            attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
            raw: true
        });
        cachedHalte = haltes;
        console.log(`✅ Cache Halte Diperbarui: ${haltes.length} halte dimuat.`);
    } catch (err) {
        console.error("❌ Gagal update cache halte:", err.message);
    }
};
updateHalteCache();
setInterval(updateHalteCache, 10 * 60 * 1000);

// --- HELPER: Hitung Jarak ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const R = 6371e3; // (meter)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// --- KONEKSI MQTT ---
const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.on("connect", () => {
    console.log("✅ Terhubung ke MQTT Broker");
    client.subscribe("syifa/tracking/bus/#", (err) => {
        if (!err) console.log("📡 Subscribe: syifa/tracking/bus/#");
    });
});

client.on("message", async (topic, message) => {
    const topicParts = topic.split("/");
    if (topicParts.length < 5) return;

    const bus_id = parseInt(topicParts[3]);
    const messageType = topicParts[4];

    if (isNaN(bus_id) || messageType !== "location") return;

    try {
        const payload = JSON.parse(message.toString());
        const { latitude, longitude, speed, passenger_count } = payload;

        if (latitude == null || longitude == null) return;

        const bus = await Bus.findByPk(bus_id, { attributes: ['id_bus', 'penumpang'] });
        if (!bus) {
            return;
        }

        const finalPassengerCount = Number.isInteger(passenger_count) ? passenger_count : bus.penumpang;

        let nearestHalte = null;
        let minDistance = Infinity;

        if (cachedHalte.length > 0) {
            for (const h of cachedHalte) {
                const dist = calculateDistance(latitude, longitude, parseFloat(h.latitude), parseFloat(h.longitude));
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestHalte = h;
                }
            }
        }

        let nextHalteId = null;
        let etaSeconds = 0;

        if (nearestHalte) {
            nextHalteId = nearestHalte.id_halte;
            
            const speedMps = (speed && speed > 0 ? speed : 20) / 3.6; 
            etaSeconds = Math.round(minDistance / speedMps);
        }

        const now = new Date();

        await Promise.all([
            Bus.update({
                latitude,
                longitude,
                speed: speed || 0,
                penumpang: finalPassengerCount,
                terakhir_dilihat: now,
                next_halte_id: nextHalteId,
                distance_to_next_halte: minDistance,
                eta_seconds: etaSeconds,
                status: (speed > 1) ? 'berjalan' : 'berhenti'
            }, { 
                where: { id_bus: bus_id } 
            }),

            TrackingHistory.create({
                bus_id,
                latitude,
                longitude,
                speed: speed || 0,
                passenger_count: finalPassengerCount,
                created_at: now
            })
        ]);

        emitBusUpdate({
            bus_id,
            latitude,
            longitude,
            speed: speed || 0,
            passenger_count: finalPassengerCount,
            next_halte_id: nextHalteId,
            nama_halte_tujuan: nearestHalte ? nearestHalte.nama_halte : null,
            distance: minDistance,
            eta_seconds: etaSeconds,
            updated_at: now
        });

    } catch (err) {
        console.error("❌ MQTT Process Error:", err.message);
    }
});

export default client;