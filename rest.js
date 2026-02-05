import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 5000; // Kita pakai port beda agar tidak bentrok dengan app utama

// Middleware
app.use(cors()); // Agar bisa diakses dari browser/HTML
app.use(express.json()); // Agar bisa baca JSON dari body request

// === ENDPOINT REST API ===
app.post('/api/update-lokasi', (req, res) => {
    // 1. Catat waktu masuk
    const timeReceived = Date.now();
    
    // 2. Ambil data dari body
    const data = req.body;
    
    // 3. Log untuk melihat data masuk
    console.log(`[REST] 📩 Masuk: Bus ${data.bus_id} | Speed: ${data.speed} | Size: ${JSON.stringify(data).length} bytes`);

    // 4. Kirim Balasan (Response) ke Pengirim
    // REST API wajib membalas. Kalau tidak, browser akan 'hanging'.
    res.status(200).json({
        status: "success",
        server_time: timeReceived,
        message: "Data diterima via HTTP POST"
    });
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`🚀 Server REST API siap di http://localhost:${PORT}`);
    console.log(`Siap menerima request POST di /api/update-lokasi`);
});