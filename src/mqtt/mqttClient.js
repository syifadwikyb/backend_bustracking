import mqtt from "mqtt";
import db from "../api/config/db.js";
import {emitBusUpdate} from "../ws/socket.js"; // koneksi MySQL kamu

// connect ke broker publik HiveMQ
const client = mqtt.connect("mqtt://broker.hivemq.com:1883");

// subscribe ke topik
client.subscribe("syifa/tracking/bus/#", (err) => {
    if (!err) {
        console.log("Subscribed ke topik syifa/tracking/bus/#");
    }
});

// terima pesan dari broker
client.on("message", async (topic, message) => {
    const payload = message.toString();
    try {
        if (payload.startsWith("{")) {
            const data = JSON.parse(payload);
            const {bus_id, latitude, longitude, speed} = data;

            // insert ke tracking_history
            await db.query(
                `INSERT INTO tracking_history (id_bus, latitude, longitude, speed, updated_at)
                 VALUES (:bus_id, :latitude, :longitude, :speed, NOW())`,
                {
                    replacements: {bus_id, latitude, longitude, speed},
                    type: db.QueryTypes.INSERT,
                }
            );

            console.log(
                `✅ Data bus ${bus_id} updated: ${latitude},${longitude}, speed ${speed}`
            );

            emitBusUpdate({
                bus_id,
                latitude,
                longitude,
                speed,
                updated_at: new Date(),
            });

        } else {
            console.log(`⚠️ Pesan non-JSON masuk dari broker: ${payload}`);
        }
    } catch (error) {
        console.error("❌ Error parsing MQTT message:", error.message, "Payload:", payload);
    }
});