import mqtt from "mqtt";
import { emitBusUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Schedule from "../api/models/Schedule.js";
import Jalur from "../api/models/Jalur.js";
import Halte from "../api/models/Halte.js";
import TrackingHistory from "../api/models/TrackingHistory.js";
import { getEtaFromML } from "../api/controllers/EtaController.js";

// --- KONFIGURASI ---
const CACHE_DURATION = 10 * 60 * 1000; // 10 Menit

// --- MEMORY CACHE ---
let cachedHalte = [];
const busSpeedBuffer = {};

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

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

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
    console.log("✅ [MQTT UTAMA] Berhasil Terhubung ke Broker!");
    client.subscribe("diptrack/tracking/bus/#", (err) => {
        if (!err) {
            console.log("📡 [MQTT UTAMA] Sukses Subscribe ke topik diptrack/tracking/bus/#");
        } else {
            console.error("❌ [MQTT UTAMA] Gagal Subscribe:", err);
        }
    });
});

client.on("error", (err) => {
    console.error("❌ [MQTT UTAMA] Error Koneksi:", err.message);
});

client.on("reconnect", () => {
    console.log("🔄 [MQTT UTAMA] Mencoba terhubung kembali...");
});

client.on("message", async (topic, message) => {
    console.log(`\n======================================`);
    console.log(`📥 [MQTT] Pesan masuk di topik: ${topic}`);

    const topicParts = topic.split("/");
    if (topicParts.length < 5 || topicParts[4] !== "location") {
        return;
    }

    const bus_id = parseInt(topicParts[3]);
    if (isNaN(bus_id)) return;

    try {
        const payload = JSON.parse(message.toString());
        if (payload.latitude == null || payload.longitude == null) return;

        console.log(`🔍 [DB] Mencari bus ID ${bus_id} di tabel database...`);
        
        // 1. AMBIL DATA BUS BESERTA JADWAL DAN JALUR
        const currentBus = await Bus.findByPk(bus_id, {
            include: [{
                model: Schedule,
                as: 'jadwal',
                required: false,
                include: [{
                    model: Jalur,
                    as: 'jalur',
                    // HANYA AMBIL HALTE YANG BENAR-BENAR BERELASI DENGAN JALUR INI
                    include: [{ model: Halte, as: 'halte' }] 
                }]
            }]
        });

        if (!currentBus) {
            console.log(`❌ [DB] Bus dengan ID ${bus_id} TIDAK DITEMUKAN di database!`);
            return;
        }

        // 2. PERBAIKAN PENCARIAN JADWAL: Pastikan formatnya array, lalu cari yang "berjalan"
        const jadwalList = Array.isArray(currentBus.jadwal) ? currentBus.jadwal : (currentBus.jadwal ? [currentBus.jadwal] : []);
        const activeSchedule = jadwalList.find(j => j.status && String(j.status).toLowerCase().trim() === 'berjalan');

        let mlResult = { eta_seconds: null, next_halte_id: null, daftar_eta: [] };
        let minDistance = Infinity;
        let targetHalteName = null;
        let targetHalte = null;

        if (!activeSchedule) {
            // Log ini akan memberi tahu status apa yang sebenarnya terbaca
            const statusTersedia = jadwalList.map(j => j.status).join(', ') || 'KOSONG';
            console.log(`⚠️ [DB] Bus ID ${bus_id} Prediksi dilewati! (Status jadwal di DB: [${statusTersedia}])`);
        } else if (activeSchedule.jalur?.halte && activeSchedule.jalur.halte.length > 0) { 
            console.log(`✅ [DB] Jadwal aktif ditemukan (Jalur ID: ${activeSchedule.jalur.id_jalur}). Memulai ML...`);
            
            // 3. PENGAMANAN RUTE: Hanya memprediksi halte yang ada di dalam jalur aktif bus ini
            const allHaltes = activeSchedule.jalur.halte;
            let targetIndex = 0;

            const haltesWithDistance = allHaltes.map((h, index) => {
                const dist = getDistanceMeters(payload.latitude, payload.longitude, parseFloat(h.latitude), parseFloat(h.longitude));
                return { ...h.toJSON(), indexLama: index, jarakSaatIni: dist };
            });

            const halteTerdekat = haltesWithDistance.reduce((prev, curr) => (prev.jarakSaatIni < curr.jarakSaatIni) ? prev : curr);
            
            minDistance = halteTerdekat.jarakSaatIni;
            targetHalte = halteTerdekat;
            targetIndex = halteTerdekat.indexLama;

            console.log(`📍 [INFO] Halte terdekat: ${targetHalte.nama_halte} (Jarak: ${Math.round(minDistance)}m) urutan ke-${targetIndex}`);

            let mulaiDariIndex = targetIndex;
            if (minDistance < 50 && targetIndex < allHaltes.length - 1) {
                mulaiDariIndex = targetIndex + 1; 
            }

            const sisaHaltes = allHaltes.slice(mulaiDariIndex);
            console.log(`📋 [INFO] Menyiapkan ML untuk ${sisaHaltes.length} halte di rute ini.`);

            if (targetHalte && sisaHaltes.length > 0) {
                targetHalteName = targetHalte.nama_halte;
                const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);
                const now = new Date();

                const mlPromises = sisaHaltes.map(async (h, i) => {
                    const distToH = getDistanceMeters(payload.latitude, payload.longitude, parseFloat(h.latitude), parseFloat(h.longitude));
                    const remainingCount = sisaHaltes.length - i; 

                    const mlPayload = {
                        remaining_halte_count: remainingCount,
                        distance_to_target: distToH,
                        rolling_speed_30s: rollingSpeed,
                        hour_of_day: now.getHours(),
                        day_of_week: now.getDay()
                    };

                    const prediksiEtaDetik = await getEtaFromML(mlPayload);

                    if (prediksiEtaDetik !== null) {
                        return {
                            halte_id: h.id_halte,
                            nama_halte: h.nama_halte,
                            distance_meters: distToH,
                            eta_seconds: prediksiEtaDetik
                        };
                    }
                    return null;
                });

                const hasilSemuaEta = await Promise.all(mlPromises);
                const listSemuaEta = hasilSemuaEta.filter(eta => eta !== null);
                listSemuaEta.sort((a, b) => a.distance_meters - b.distance_meters);

                if (listSemuaEta.length > 0) {
                    mlResult.eta_seconds = listSemuaEta[0].eta_seconds;
                    mlResult.next_halte_id = targetHalte.id_halte;
                }
                mlResult.daftar_eta = listSemuaEta;
            }
        } else {
            console.log(`⚠️ [DB] Bus ID ${bus_id} dilewati! Jalur yang dipilih (ID: ${activeSchedule.jalur?.id_jalur || '?'}) BELUM MEMILIKI HALTE.`);
        }

        const now = new Date();
        const finalPassenger = payload.passenger_count ?? currentBus.penumpang;

        console.log(`💾 [DB] Menyimpan data lokasi...`);
        await Promise.all([
            Bus.update({
                latitude: payload.latitude,
                longitude: payload.longitude,
                speed: payload.speed || 0,
                penumpang: finalPassenger,
                terakhir_dilihat: now,
                next_halte_id: targetHalte ? targetHalte.id_halte : null,
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

        console.log(`📡 [Socket] Menyiarkan data ke Frontend...`);
        emitBusUpdate({
            bus_id,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed || 0,
            passenger_count: finalPassenger,
            next_halte_id: targetHalte ? targetHalte.id_halte : null,
            nama_halte_tujuan: targetHalteName,
            distance: minDistance,
            eta_seconds: mlResult.eta_seconds,
            daftar_eta: mlResult.daftar_eta || [],
            updated_at: now
        });

        console.log(`✅ [SELESAI] Data bus ${bus_id} berhasil diproses!`);
        console.log(`======================================\n`);

    } catch (err) {
        console.error("❌ [ERROR] Terjadi kesalahan MQTT:", err);
    }
});

export default client;