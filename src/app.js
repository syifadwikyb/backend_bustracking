import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from "http";
import { fileURLToPath } from 'url';

// Import Konfigurasi & Koneksi
import sequelize from './api/config/db.js';
import setupAssociations from './api/config/Associations.js';

// Import Routes
import authRoutes from './api/routes/authRoutes.js';
import driverRoutes from './api/routes/driverRoutes.js';
import busRoutes from "./api/routes/busRoutes.js";
import halteRoutes from './api/routes/halteRoutes.js';
import jalurRoutes from './api/routes/jalurRoutes.js';
import maintenanceRoutes from "./api/routes/maintenanceRoutes.js";
import scheduleRoutes from "./api/routes/scheduleRoutes.js";
import dashboardRoutes from './api/routes/dashboardRoutes.js';

// Import Modul Lain
// NOTE: Socket.io dan MQTT tidak berjalan sempurna di Vercel (Serverless)
// Kode ini dimodifikasi agar tidak error saat deploy
import initSocket from './ws/socket.js';

// Mencegah MQTT running di Vercel agar tidak timeout (optional)
if (process.env.NODE_ENV !== 'production') {
    // import "./mqtt/mqttClient.js"; // Uncomment jika ingin jalan di local
}

// --- Konfigurasi Awal ---
dotenv.config();
const app = express();

// --- Middleware ---
app.use(express.json());
app.use(cors());

// --- Initial Setup (Database Associations) ---
// Jalankan asosiasi model segera agar siap saat request masuk
try {
    setupAssociations();
    console.log('🔗 Hubungan antar model berhasil disetel.');
} catch (err) {
    console.error('Gagal setup asosiasi:', err);
}

// --- Daftarkan Routes API ---
app.get('/', (req, res) => res.send('Backend API is Running...')); // Route Check
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bus', busRoutes);
app.use('/api/halte', halteRoutes);
app.use('/api/jalur', jalurRoutes);
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/dashboard', dashboardRoutes);


// --- LOGIKA KONEKSI DATABASE ---
// Di serverless, koneksi DB dilakukan saat runtime, bukan saat startup server
const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Koneksi database berhasil.');
        // await sequelize.sync({ alter: false }); // Hati-hati menggunakan sync di production
    } catch (error) {
        console.error('❌ Gagal terhubung ke database:', error);
    }
};

// Panggil fungsi connectDB. 
// Di Vercel, ini akan berjalan setiap kali "Function" dibangunkan.
connectDB();

// --- JALANKAN SERVER (HANYA UNTUK LOCAL / VPS) ---
// Pengecekan: Apakah file ini dijalankan langsung (node app.js)?
// Jika YA -> Jalankan server.listen
// Jika TIDAK (di-import Vercel) -> Jangan jalankan listen
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = createServer(app);

    // Socket hanya diinisialisasi jika berjalan sebagai server tradisional
    initSocket(server);

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`🚀 Server berjalan (Mode Local) di port ${PORT}`);
    });
}

// Export app untuk Vercel
export default app;