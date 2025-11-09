import mqtt from "mqtt";
import { emitBusUpdate, emitPassengerUpdate } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import PassengerHistory from "../api/models/PassengerStat.js";
import db from "../api/config/db.js"; // <-- PENTING: Impor 'db' untuk query mentah

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

            // 1. Update status live di tabel bus (kolom nama baru)
            await Bus.update({
                latitude: latitude,
                longitude: longitude,
                terakhir_dilihat: now
            }, {
                where: { id_bus: bus_id }
            });

            // 2. Simpan ke tracking_history (INI DIA PERBAIKANNYA)
            // Menggunakan db.query() seperti kode asli Anda
            await db.query(
                `INSERT INTO tracking_history (bus_id, latitude, longitude, speed, updated_at)
                 VALUES (:bus_id, :latitude, :longitude, :speed, :updated_at)`,
                {
                    replacements: { bus_id, latitude, longitude, speed, updated_at: now },
                    type: db.QueryTypes.INSERT,
                }
            );

            // 3. Emit ke WebSocket
            const locationData = { bus_id, latitude, longitude, speed, updated_at: now };
            emitBusUpdate(locationData);
            console.log(`✅ [Lokasi] Bus ${bus_id}: ${latitude},${longitude}`);

        } else if (messageType === 'passengers') {
            const { passenger_count } = data;

            // 1. Update jumlah penumpang di tabel bus (kolom nama baru)
            await Bus.update({
                penumpang: passenger_count,
                terakhir_dilihat: now
            }, {
                where: { id_bus: bus_id }
            });

            // 2. Simpan ke riwayat penumpang (sesuai nama kolom baru Anda)
            await PassengerHistory.create({
                bus_id: bus_id,
                jumlah_penumpang: passenger_count,
                timestamp: now
            });

            // 3. Emit ke WebSocket
            const passengerData = { bus_id, passenger_count, updated_at: now };
            emitPassengerUpdate(passengerData);
            console.log(`✅ [Penumpang] Bus ${bus_id}: ${passenger_count} orang`);
        }

    } catch (error) {
        console.error("❌ Error parsing MQTT message:", error.message, "Payload:", payload);
    }
});