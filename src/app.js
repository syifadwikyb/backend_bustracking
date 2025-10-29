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

// Import Modul Lain
import initSocket from './ws/socket.js';
import "./mqtt/mqttClient.js"; // Inisialisasi MQTT Client

// --- Konfigurasi Awal ---
dotenv.config();
const app = express();

// --- Middleware ---
app.use(express.json()); // Middleware untuk parsing JSON
app.use(cors()); // Middleware untuk mengizinkan request dari origin lain (misal: React di port 3000)

// --- Daftarkan Routes API ---
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/bus', busRoutes);
app.use('/api/halte', halteRoutes);
app.use('/api/jalur', jalurRoutes);
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/dashboard', dashboardRoutes);

// --- Setup Server ---
const server = createServer(app);
initSocket(server);

const startServer = async () => {
    try {
        // 1️⃣ Setup relasi antar model terlebih dahulu
        setupAssociations();
        console.log('🔗 Hubungan antar model berhasil disetel.');

        // 2️⃣ Baru koneksi ke database
        await sequelize.authenticate();
        console.log('✅ Koneksi database berhasil.');

        // (Opsional) Sinkronisasi struktur database
        // await sequelize.sync({ alter: false });

        // 3️⃣ Jalankan server
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`🚀 Server berjalan di port ${PORT}`);
        });

    } catch (error) {
        console.error('❌ Gagal terhubung ke database atau memulai server:', error);
    }
};

// --- Jalankan Server ---
startServer();

