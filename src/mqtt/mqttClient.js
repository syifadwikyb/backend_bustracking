import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js"; // Pastikan path benar
import Bus from "../api/models/Bus.js";
import Schedule from "../api/models/Schedule.js";
import Jalur from "../api/models/Jalur.js";
import Halte from "../api/models/Halte.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

// --- KONFIGURASI ---
const ML_API_URL = "http://localhost:8000/predict-eta"; // URL Tim ML
const CACHE_DURATION = 10 * 60 * 1000; // 10 Menit

// --- MEMORY CACHE ---
let cachedHalte = [];
const busSpeedBuffer = {}; // Untuk Rolling Speed

// Update Cache Halte (Opsional, untuk backup jika DB lambat)
const updateHalteCache = async () => {
    try {
        const haltes = await Halte.findAll({
            attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
            raw: true
        });
        cachedHalte = haltes;
        console.log(`✅ Cache Halte Diperbarui: ${haltes.length} halte.`);
    } catch (err) {
        console.error("❌ Gagal cache halte:", err.message);
    }
};
updateHalteCache();
setInterval(updateHalteCache, CACHE_DURATION);

// 1. Hitung Jarak (Haversine) - Output Meter
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

// 2. Hitung Rolling Speed (Rata-rata 30 detik)
function calculateRollingSpeed(busId, currentSpeed) {
    if (!busSpeedBuffer[busId]) busSpeedBuffer[busId] = [];
    busSpeedBuffer[busId].push(currentSpeed);
    if (busSpeedBuffer[busId].length > 10) busSpeedBuffer[busId].shift();
    const sum = busSpeedBuffer[busId].reduce((a, b) => a + b, 0);
    return parseFloat((sum / busSpeedBuffer[busId].length).toFixed(2));
}

// --- MQTT CLIENT ---
const client = mqtt.connect("mqtt://145.79.15.182:1883");

client.on("connect", () => {
    console.log("✅ Terhubung ke MQTT Broker");
    client.subscribe("diptrack/tracking/bus/#");
});

client.on("message", async (topic, message) => {
    console.log(`🔔 PING! Ada pesan di topik: ${topic}`);
    console.log(`📦 Isinya: ${message.toString()}`);

    const topicParts = topic.split("/");
    if (topicParts.length < 5 || topicParts[4] !== "location") return;

    const bus_id = parseInt(topicParts[3]);
    if (isNaN(bus_id)) return;

    try {
        const payload = JSON.parse(message.toString());
        if (payload.latitude == null || payload.longitude == null) return;

        const currentBus = await Bus.findByPk(bus_id, {
            include: [{
                model: Schedule,
                as: 'jadwal',
                where: { status: 'berjalan' },
                required: false,
                include: [{
                    model: Jalur,
                    as: 'jalur',
                    include: [{ 
                        model: Halte, 
                        as: 'halte'
                    }]
                }]
            }]
        });

        if (!currentBus) return;

        // Persiapan Data untuk ML
        const activeSchedule = currentBus.jadwal?.[0];
        let mlResult = { eta_seconds: null, next_halte_id: null };
        let minDistance = Infinity;
        let targetHalteName = null;

        if (activeSchedule && activeSchedule.jalur?.halte) { 
            const allHaltes = activeSchedule.jalur.halte;
            
            let targetIndex = 0;
            let targetHalte = null;

            allHaltes.forEach((h, index) => {
                const dist = getDistanceMeters(payload.latitude, payload.longitude, parseFloat(h.latitude), parseFloat(h.longitude));
                if (dist < minDistance) {
                    minDistance = dist;
                    targetHalte = h;
                    targetIndex = index;
                }
            });

            if (targetHalte) {
                targetHalteName = targetHalte.nama_halte;
                
                const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);
                const remainingCount = allHaltes.length - targetIndex;
                const now = new Date();

                const mlPayload = {
                    route_id: activeSchedule.jalur_id,
                    remaining_halte_count: remainingCount,
                    distance_to_target: minDistance,
                    rolling_speed_30s: rollingSpeed,
                    hour_of_day: now.getHours(),
                    day_of_week: now.getDay()
                };

                try {
                    const response = await fetch(ML_API_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(mlPayload)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        mlResult.eta_seconds = result.eta_second;
                        mlResult.next_halte_id = targetHalte.id_halte;
                    }
                } catch (mlErr) {
                    console.error("⚠️ ML Service Error/Skip:", mlErr.message);
                }
            }
        }

        const now = new Date();
        const finalPassenger = payload.passenger_count ?? currentBus.penumpang;

        await Promise.all([
            Bus.update({
                latitude: payload.latitude,
                longitude: payload.longitude,
                speed: payload.speed || 0,
                penumpang: finalPassenger,
                terakhir_dilihat: now,
                next_halte_id: mlResult.next_halte_id,
                distance_to_next_halte: minDistance === Infinity ? 0 : minDistance,
                eta_seconds: mlResult.eta_seconds,
                status: (payload.speed > 1) ? 'berjalan' : 'berhenti'
            }, { where: { id_bus: bus_id } }),

            TrackingHistory.create({
                bus_id,
                latitude: payload.latitude,
                longitude: payload.longitude,
                speed: payload.speed || 0,
                passenger_count: finalPassenger,
                created_at: now
            })
        ]);

        emitBusUpdate({
            bus_id,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed || 0,
            passenger_count: finalPassenger,
            next_halte_id: mlResult.next_halte_id,
            nama_halte_tujuan: targetHalteName,
            distance: minDistance,
            eta_seconds: mlResult.eta_seconds,
            updated_at: now
        });

    } catch (err) {
        console.error("❌ MQTT Process Error:", err.message);
    }
});

export default client;