import mqtt from "mqtt";

const broker = "mqtt://145.79.15.182:1883";
console.log(`Menghubungkan ke ${broker}...`);

const client = mqtt.connect(broker);

client.on("connect", () => {
    console.log("✅ Alat Sadap Terhubung ke Broker!");
    
    // Subscribe ke tanda "#" artinya MENYADAP SEMUA TOPIK yang lewat di broker
    client.subscribe("#", (err) => {
        if (!err) {
            console.log("🎧 Sedang menyadap semua pesan yang lewat...");
        } else {
            console.log("❌ Gagal menyadap:", err);
        }
    });
});

client.on("message", (topic, message) => {
    console.log(`\n📨 PESAN LEWAT:`);
    console.log(`- Topik: ${topic}`);
    console.log(`- Isi  : ${message.toString()}`);
});

client.on("error", (err) => {
    console.log("❌ Error Broker:", err.message);
});