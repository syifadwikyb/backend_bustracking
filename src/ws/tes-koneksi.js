import mqtt from 'mqtt';

// ==========================================
// KONFIGURASI TARGET (VPS KAMU)
// ==========================================
// Perhatikan formatnya: mqtt://IP:PORT
const HOST = 'mqtt://145.79.15.182:1883'; 

console.log(`⏳ Mencoba menghubungi Broker di ${HOST}...`);
console.log(`   (Jika lama tidak ada respon, berarti Firewall VPS masih tertutup)`);

const client = mqtt.connect(HOST, {
    connectTimeout: 5000 
});

// 1. Jika Berhasil Konek
client.on('connect', () => {
    console.log("✅ BERHASIL! Laptop terhubung ke VPS.");
    
    // Tes Kirim Pesan ke diri sendiri
    client.subscribe('tes/jaringan', (err) => {
        if (!err) {
            client.publish('tes/jaringan', 'Halo Broker, ini tes dari Laptop!');
            console.log("📤 Mengirim pesan tes...");
        }
    });
});

// 2. Jika Menerima Balasan (Artinya Broker Normal)
client.on('message', (topic, message) => {
    console.log(`📩 Balasan dari Broker: ${message.toString()}`);
    console.log("🎉 KESIMPULAN: Broker AMAN dan SIAP DIGUNAKAN.");
    client.end(); // Tutup koneksi
});

// 3. Jika Gagal / Error
client.on('error', (err) => {
    console.error("❌ KONEKSI GAGAL:", err.message);
    client.end();
});

// 4. Jika Offline (Biasanya IP salah atau Broker mati)
client.on('offline', () => {
    console.log("⚠️ Broker Offline atau tidak bisa dijangkau.");
});