import mqtt from "mqtt";
import { emitBusUpdate, emitPassengerUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Halte from "../api/models/Halte.js";
import PassengerHistory from "../api/models/PassengerHistory.js";
import TrackingHistory from "../api/models/TrackingHistory.js";

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
    if (topicParts.length < 5) return;

    const bus_id = parseInt(topicParts[3]);
    const messageType = topicParts[4];

    if (isNaN(bus_id)) return;

    try {
        const payload = message.toString();
        const data = JSON.parse(payload);
        const now = new Date();

        if (messageType === 'location') {
            const { latitude, longitude, speed } = data;

            const potentialNextHalteId = 1;
            let validNextHalteId = null;
            let jarakMeter = 0;
            let estimasiDetik = 0;

            const targetHalte = await Halte.findByPk(potentialNextHalteId);
            if (targetHalte) {
                validNextHalteId = potentialNextHalteId;
                jarakMeter = calculateDistance(latitude, longitude, targetHalte.latitude, targetHalte.longitude);
                const speedMps = (speed > 1 ? speed : 20) / 3.6;
                estimasiDetik = Math.round(jarakMeter / speedMps);
            }

            const [updatedRows] = await Bus.update({
                latitude: latitude,
                longitude: longitude,
                terakhir_dilihat: now,
                next_halte_id: validNextHalteId,
                distance_to_next_halte: jarakMeter,
                eta_seconds: estimasiDetik,
            }, {
                where: { id_bus: bus_id }
            });

            if (updatedRows === 0) {
                console.warn(`⚠️ Bus ID ${bus_id} tidak ditemukan di database.`);
                return;
            }

            try {
                const existingHistory = await TrackingHistory.findOne({
                    where: { bus_id: bus_id }
                });

                if (existingHistory) {
                    await existingHistory.update({
                        latitude: latitude,
                        longitude: longitude,
                        speed: speed || 0,
                        updated_at: now
                    });
                } else {
                    await TrackingHistory.create({
                        bus_id: bus_id,
                        latitude: latitude,
                        longitude: longitude,
                        speed: speed || 0,
                        created_at: now,
                        updated_at: now
                    });
                }
            } catch (histError) {
                console.warn("⚠️ Gagal update history:", histError.message);
            }

            const locationData = {
                bus_id,
                id_bus: bus_id,
                latitude,
                longitude,
                speed,
                status: 'berjalan',
                eta_seconds: estimasiDetik,
                updated_at: now
            };

            emitBusUpdate(locationData);
            console.log(`📍 Bus ${bus_id} Moved | History Updated | Socket Emitted`);

        }

        else if (messageType === 'passengers') {
            const { passenger_count } = data;

            await Bus.update({
                penumpang: passenger_count,
                terakhir_dilihat: now
            }, { where: { id_bus: bus_id } });

            await PassengerHistory.create({
                bus_id: bus_id,
                jumlah_penumpang: passenger_count,
                timestamp: now
            });

            emitPassengerUpdate({ id_bus: bus_id, passenger_count });
            console.log(`👥 Bus ${bus_id} Penumpang: ${passenger_count}`);
        }

    } catch (error) {
        console.error("❌ Error MQTT Message:", error.message);
    }
});