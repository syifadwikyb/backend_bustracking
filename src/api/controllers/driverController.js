import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import { Op } from 'sequelize';

// Import Dayjs & Plugin Timezone
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

// Konfigurasi Timezone Jakarta
dayjs.extend(utc);
dayjs.extend(timezone);

// --- CREATE DRIVER ---
export const createDriver = async (req, res) => {
    try {
        // req.body berisi text, req.file berisi file (berkat middleware)
        const { kode_driver, nama, tanggal_lahir, nomor_telepon, status } = req.body;

        // Ambil nama file jika ada upload
        const foto = req.file ? req.file.filename : null;

        const driver = await Driver.create({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto,
            status: status || 'berhenti', // Default status berhenti
        });
        res.status(201).json(driver);
    } catch (err) {
        console.error("Error createDriver:", err);
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// --- GET ALL DRIVERS (DENGAN STATUS OTOMATIS) ---
export const getDrivers = async (req, res) => {
    try {
        // 1. Tentukan Waktu Sekarang (Zona Jakarta)
        const now = dayjs().tz("Asia/Jakarta");
        const currentDate = now.format('YYYY-MM-DD');
        const currentTime = now.format('HH:mm:ss');

        // 2. Ambil Driver + Jadwal Hari Ini
        const drivers = await Driver.findAll({
            include: [{
                model: Schedule,
                as: 'jadwal',
                where: { tanggal: currentDate },
                required: false // LEFT JOIN agar driver tanpa jadwal tetap muncul
            }],
            order: [['nama', 'ASC']]
        });

        // 3. Loop untuk update status real-time
        const processedDrivers = await Promise.all(drivers.map(async (driver) => {
            let calculatedStatus = 'berhenti'; // Default

            // Jika ada jadwal hari ini
            if (driver.jadwal && driver.jadwal.length > 0) {
                let isRunning = false;
                let isScheduled = false;

                for (const s of driver.jadwal) {
                    // Cek apakah jam sekarang ada di rentang jadwal
                    if (currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
                        isRunning = true;
                        break; // Prioritas tertinggi
                    }
                    // Cek apakah jadwal akan datang (belum mulai)
                    if (currentTime < s.jam_mulai) {
                        isScheduled = true;
                    }
                }

                if (isRunning) calculatedStatus = 'berjalan';
                else if (isScheduled) calculatedStatus = 'dijadwalkan';
            }

            // 4. Sinkronisasi Database jika status berubah
            if (driver.status !== calculatedStatus) {
                await driver.update({ status: calculatedStatus });
                driver.setDataValue('status', calculatedStatus);
            }

            // Bersihkan data jadwal dari response (opsional, biar rapi)
            const driverJson = driver.toJSON();
            delete driverJson.jadwal;

            // Pastikan status di JSON response adalah hasil kalkulasi terbaru
            driverJson.status = calculatedStatus;

            return driverJson;
        }));

        res.json(processedDrivers);

    } catch (err) {
        console.error('Error getDrivers:', err);
        res.status(500).json({ message: err.message });
    }
};

// --- GET BY ID ---
export const getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });
        res.json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// --- UPDATE DRIVER ---
export const updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });

        const { kode_driver, nama, tanggal_lahir, nomor_telepon, status } = req.body;

        // Logika Foto: Jika ada upload baru pakai yang baru, jika tidak pakai yang lama
        const fotoFinal = req.file ? req.file.filename : driver.foto;

        await driver.update({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto: fotoFinal,
            status: status || driver.status // Pertahankan status lama jika tidak dikirim
        });

        res.json(driver);
    } catch (err) {
        console.error("Error updateDriver:", err);
        res.status(500).json({ message: err.message });
    }
};

// --- DELETE DRIVER ---
export const deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });

        await driver.destroy();
        res.json({ message: 'Driver berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};