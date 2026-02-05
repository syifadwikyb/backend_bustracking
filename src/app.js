import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from "http";
import startCleanupJob from './cron/Cleanup.js';

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

// --- PERUBAHAN 1: Import emitBusUpdate juga ---
import initSocket, { emitBusUpdate } from './ws/socket.js'; 
import "./mqtt/mqttClient.js"; 

// --- Konfigurasi Awal ---
dotenv.config();
const app = express();

// PENTING: Server HTTP dibuat di luar logika apapun
const server = createServer(app); 

// --- Middleware ---
app.use(express.json()); // Wajib agar bisa baca body JSON dari REST API
app.use(cors({
    origin: "*",
    methods: ["GET", "POST","PUT", "DELETE"]
}));
app.use('/uploads', express.static('uploads'));

// --- Setup Database ---
const startDatabase = async () => {
    try {
        await setupAssociations();
        await sequelize.authenticate();
        console.log('✅ Koneksi database & asosiasi berhasil.');
    } catch (err) {
        console.error('❌ Gagal setup database:', err);
    }
};
startDatabase();

// --- Daftarkan Routes API ---
app.get('/', (req, res) => res.send('Backend Bus Tracking is Live! 🚀'));
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bus', busRoutes);
app.use('/api/halte', halteRoutes);
app.use('/api/jalur', jalurRoutes);
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/dashboard', dashboardRoutes);

// --- PERUBAHAN 2: Endpoint Khusus REST API (Hybrid Mode) ---
app.post('/api/bus-location', (req, res) => {
    const data = req.body;
    
    // 1. Log ke terminal (Agar terlihat bedanya dengan MQTT)
    console.log(`[REST-HTTP] Data Masuk Bus ${data.bus_id} | Speed: ${data.speed} km/h`);

    // 2. Kirim langsung ke Peta (Frontend) lewat Socket.io
    emitBusUpdate(data);

    // 3. Jawab HP/Simulator bahwa data diterima
    res.status(200).json({ status: "OK", timestamp: Date.now() });
});

// --- SETUP SOCKET.IO (WAJIB JALAN) ---
initSocket(server);

startCleanupJob();

// --- JALANKAN SERVER ---
const PORT = process.env.PORT || 5000;

// Gunakan '0.0.0.0' agar bisa diakses dari luar container Render/VPS
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});