import mqtt from "mqtt";
import { emitBusUpdate, emitPassengerUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js"; // Penting untuk ETA
import PassengerHistory from "../api/models/PassengerHistory.js"; // Pastikan nama file ini benar (History/Stat)
import db from "../api/config/db.js";

// Fungsi Helper: Hitung Jarak (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if ((lat1 == lat2) && (lon1 == lon2)) {
        return 0;
    }
    const R = 6371e3; // Jari-jari bumi dalam meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c); // Hasil dalam meter
}

const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.subscribe("syifa/tracking/bus/#", (err) => {
    if (!err) {
        console.log("Subscribed ke topik syifa/tracking/bus/#");
    }
});

client.on("message", async (topic, message) => {
    const payload = message.toString();
    const topicParts = topic.split('/');

    if (topicParts.length < 4) return;
    const bus_id = parseInt(topicParts[3]);
    const messageType = topicParts[4];
    if (isNaN(bus_id)) return;

    try {
        const data = JSON.parse(payload);
        const now = new Date();

        if (messageType === 'location') {
            const { latitude, longitude, speed } = data;

            // --- 1. LOGIKA ETA (Bagian yang Anda lewatkan) ---
            // (Logika Dummy Sederhana: Asumsi semua bus menuju Halte ID 2)
            // Nanti Anda bisa kembangkan untuk mencari halte selanjutnya berdasarkan rute bus
            const nextHalteId = 1; 
            let jarakMeter = 0;
            let estimasiDetik = 0;

            const targetHalte = await Halte.findByPk(nextHalteId);

            if (targetHalte) {
                // Hitung Jarak
                jarakMeter = calculateDistance(
                    latitude, longitude,
                    targetHalte.latitude, targetHalte.longitude
                );

                // Hitung Waktu (Waktu = Jarak / Kecepatan)
                // Konversi speed km/jam -> meter/detik (bagi 3.6)
                // Jika speed 0 atau sangat pelan, anggap 20 km/jam agar tidak infinity
                const speedMps = (speed > 5 ? speed : 20) / 3.6; 
                estimasiDetik = Math.round(jarakMeter / speedMps);
            }
            // --------------------------------------------------

            // 2. Update status live di tabel bus (Termasuk Data ETA)
            await Bus.update({
                latitude: latitude,
                longitude: longitude,
                terakhir_dilihat: now,
                // Update kolom ETA baru
                next_halte_id: nextHalteId,
                distance_to_next_halte: jarakMeter,
                eta_seconds: estimasiDetik
            }, {
                where: { id_bus: bus_id }
            });

            // 3. Simpan ke tracking_history
            await db.query(
                `INSERT INTO tracking_history (bus_id, latitude, longitude, speed, updated_at)
                 VALUES (:bus_id, :latitude, :longitude, :speed, :updated_at)`,
                {
                    replacements: { bus_id, latitude, longitude, speed, updated_at: now },
                    type: db.QueryTypes.INSERT,
                }
            );

            // 4. Emit ke WebSocket (Termasuk Data ETA untuk Frontend)
            const locationData = {
                bus_id,
                latitude,
                longitude,
                speed,
                updated_at: now,
                // Kirim data ETA ke frontend juga
                next_halte_id: nextHalteId,
                distance_to_next_halte: jarakMeter,
                eta_seconds: estimasiDetik
            };
            emitBusUpdate(locationData);
            console.log(`✅ [Lokasi] Bus ${bus_id}: ${latitude},${longitude} | ETA: ${estimasiDetik}s`);

        } else if (messageType === 'passengers') {
            const { passenger_count } = data;

            // Update jumlah penumpang di tabel bus
            await Bus.update({
                penumpang: passenger_count,
                terakhir_dilihat: now
            }, {
                where: { id_bus: bus_id }
            });

            // Simpan ke riwayat penumpang
            await PassengerHistory.create({
                bus_id: bus_id,
                jumlah_penumpang: passenger_count,
                timestamp: now
            });

            // Emit ke WebSocket
            const passengerData = { bus_id, passenger_count, updated_at: now };
            emitPassengerUpdate(passengerData);
            console.log(`✅ [Penumpang] Bus ${bus_id}: ${passenger_count} orang`);
        }

    } catch (error) {
        console.error("❌ Error parsing MQTT message:", error.message, "Payload:", payload);
    }
});