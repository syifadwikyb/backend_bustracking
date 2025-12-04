import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from "http";

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

// Import Socket & MQTT
import initSocket from './ws/socket.js';
// Karena di Render server nyala 24 jam, MQTT aman untuk dijalankan:
import "./mqtt/mqttClient.js"; 

// --- Konfigurasi Awal ---
dotenv.config();
const app = express();
const server = createServer(app); // Membuat HTTP Server

// --- Middleware ---
app.use(express.json());
// Update CORS agar Frontend (dari domain manapun/spesifik) bisa akses
app.use(cors({
    origin: "*", // Ganti dengan URL Frontend Anda nanti untuk keamanan
    methods: ["GET", "POST", "PUT", "DELETE"]
}));

// --- Setup Database Associations ---
try {
    setupAssociations();
    console.log('🔗 Hubungan antar model berhasil disetel.');
} catch (err) {
    console.error('Gagal setup asosiasi:', err);
}

// --- Daftarkan Routes API ---
app.get('/', (req, res) => res.send('Backend Bus Tracking is Live on Render! 🚀'));
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bus', busRoutes);
app.use('/api/halte', halteRoutes);
app.use('/api/jalur', jalurRoutes);
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/dashboard', dashboardRoutes);

// --- SETUP WEBSOCKET ---
// Wajib dipanggil sebelum server.listen
initSocket(server);

// --- START SERVER ---
const startServer = async () => {
    try {
        // 1. Cek Koneksi DB
        await sequelize.authenticate();
        console.log('✅ Koneksi database berhasil.');
        
        // Opsional: Sync database (jangan pakai force: true di production!)
        // await sequelize.sync(); 

        // 2. Jalankan Server
        // Render akan otomatis menyuntikkan PORT ke process.env.PORT
        const PORT = process.env.PORT || 5000;
        
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server berjalan di port ${PORT}`);
        });

    } catch (error) {
        console.error('❌ Gagal menjalankan server:', error);
    }
};

startServer();