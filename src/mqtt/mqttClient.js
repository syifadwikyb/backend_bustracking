import mqtt from "mqtt";
import { emitBusUpdate, emitPassengerUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import PassengerHistory from "../api/models/PassengerHistory.js";

// --- Fungsi Helper: Hitung Jarak (Haversine) ---
function calculateDistance(lat1, lon1, lat2, lon2) {
    if ((lat1 == lat2) && (lon1 == lon2)) return 0;
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

client.on("connect", () => {
    console.log("✅ Terhubung ke MQTT Broker");
    client.subscribe("syifa/tracking/bus/#", (err) => {
        if (!err) console.log("📡 Subscribed: syifa/tracking/bus/#");
    });
});

client.on("message", async (topic, message) => {
    const topicParts = topic.split('/');
    // Validasi format topik: syifa/tracking/bus/{id}/{type}
    if (topicParts.length < 5) return;

    const bus_id = parseInt(topicParts[3]);
    const messageType = topicParts[4]; // 'location' atau 'passengers'

    if (isNaN(bus_id)) return;

    try {
        const payload = message.toString();
        const data = JSON.parse(payload);
        const now = new Date();

        // ==========================================
        // KASUS 1: UPDATE LOKASI (Hanya Update, Tidak Insert)
        // ==========================================
        if (messageType === 'location') {
            const { latitude, longitude, speed } = data;

            // 1. Hitung ETA (Opsional, jika ada target halte)
            const nextHalteId = 1; // Logika dinamis bisa ditambahkan nanti
            let jarakMeter = 0;
            let estimasiDetik = 0;

            const targetHalte = await Halte.findByPk(nextHalteId);
            if (targetHalte) {
                jarakMeter = calculateDistance(latitude, longitude, targetHalte.latitude, targetHalte.longitude);
                // Speed m/s. Jika diam (0), anggap 5 m/s (~20km/h) untuk hindari infinity
                const speedMps = (speed > 1 ? speed : 20) / 3.6;
                estimasiDetik = Math.round(jarakMeter / speedMps);
            }

            // 2. UPDATE Database (KUNCI AGAR DB TIDAK PENUH)
            // Kita gunakan update, bukan create.
            const [updatedRows] = await Bus.update({
                latitude: latitude,
                longitude: longitude,
                terakhir_dilihat: now,
                status: 'berjalan', // Otomatis jadi berjalan jika ada update lokasi
                next_halte_id: nextHalteId,
                distance_to_next_halte: jarakMeter,
                eta_seconds: estimasiDetik,
                // Kita tidak simpan speed di kolom terpisah jika tidak perlu history
            }, {
                where: { id_bus: bus_id }
            });

            // Jika update gagal (artinya bus ID tersebut belum ada di tabel master Bus),
            // Kita biarkan saja (atau Anda bisa pilih untuk create bus baru)
            if (updatedRows === 0) {
                console.warn(`⚠️ Bus ID ${bus_id} tidak ditemukan di database. Data dilewati.`);
                return;
            }

            // 3. Emit ke Frontend (Socket)
            const locationData = {
                id_bus: bus_id, // Pastikan konsisten (id_bus vs bus_id)
                latitude,
                longitude,
                speed,
                status: 'berjalan',
                eta_seconds: estimasiDetik,
                updated_at: now
            };

            emitBusUpdate(locationData);
            console.log(`📍 Bus ${bus_id} Moved: Lat ${latitude}, Lon ${longitude}`);

        }
        // ==========================================
        // KASUS 2: PENUMPANG (Perlu History/Riwayat)
        // ==========================================
        else if (messageType === 'passengers') {
            const { passenger_count } = data;

            // Update status terkini di tabel Bus
            await Bus.update({
                penumpang: passenger_count,
                terakhir_dilihat: now
            }, { where: { id_bus: bus_id } });

            // Simpan Riwayat (Hanya ini yang menambah baris baru di DB)
            await PassengerHistory.create({
                bus_id: bus_id,
                jumlah_penumpang: passenger_count,
                timestamp: now
            });

            emitPassengerUpdate({ id_bus: bus_id, penumpang: passenger_count });
            console.log(`👥 Bus ${bus_id} Penumpang: ${passenger_count}`);
        }

    } catch (error) {
        console.error("❌ Error MQTT Message:", error.message);
    }
});