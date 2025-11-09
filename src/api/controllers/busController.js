import Bus from '../models/Bus.js';
// --- TAMBAHKAN IMPOR INI ---
import Schedule from '../models/Schedule.js';
import Driver from '../models/Driver.js';
import Jalur from '../models/Jalur.js';
import Maintenance from '../models/Maintenance.js';
import { Op } from 'sequelize';
// ----------------------------

// Membuat bus baru (Tetap sama)
export const createBus = async (req, res) => {
    const { plat_nomor, kode_bus, kapasitas, jenis_bus, foto, status } = req.body;
    try {
        const bus = await Bus.create({
            plat_nomor, kode_bus, kapasitas, jenis_bus, foto,
            status: status || 'berhenti' // Pastikan ada default jika kosong
        });
        res.status(201).json(bus);
    } catch (err) {
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// --- FUNGSI getAllBus SEKARANG JADI "PINTAR" ---
export const getAllBus = async (req, res) => {
    try {
        const currentDate = new Date().toISOString().split("T")[0];
        const currentTime = new Date().toTimeString().split(" ")[0];

        // 1. Ambil SEMUA bus (termasuk relasinya, sama seperti di dashboard)
        const buses = await Bus.findAll({
            include: [
                {
                    model: Schedule,
                    as: "jadwal",
                    where: { tanggal: currentDate },
                    required: false, // LEFT JOIN
                    include: [
                        { model: Driver, as: "driver", attributes: ["nama", "foto"] },
                        { model: Jalur, as: "jalur", attributes: ["nama_jalur"] },
                    ],
                },
                {
                    model: Maintenance,
                    as: "riwayat_perbaikan",
                    where: { status: { [Op.not]: "selesai" } },
                    required: false, // LEFT JOIN
                },
            ],
            order: [['plat_nomor', 'ASC']] // Urutkan berdasarkan plat nomor
        });

        // 2. Hitung status di logika (Read-Only, Cepat)
        const liveBusData = buses.map((bus) => {
            let highestPriority = 0;
            let currentStatus = "berhenti"; 

            if (bus.riwayat_perbaikan?.length > 0) {
                highestPriority = 4;
            } 
            else if (bus.jadwal?.length > 0) {
                for (const j of bus.jadwal) {
                    let scheduleStatusPriority = 0;
                    if (j.jam_mulai <= currentTime && j.jam_selesai >= currentTime) {
                        scheduleStatusPriority = 3; // berjalan
                    } else if (j.jam_mulai > currentTime) {
                        scheduleStatusPriority = 2; // dijadwalkan
                    }
                    if (scheduleStatusPriority > highestPriority) {
                        highestPriority = scheduleStatusPriority;
                    }
                }
            }

            if (highestPriority === 4) currentStatus = 'dalam perbaikan';
            else if (highestPriority === 3) currentStatus = 'berjalan';
            else if (highestPriority === 2) currentStatus = 'dijadwalkan';

            const data = bus.toJSON();
            data.status = currentStatus; // Set status yang benar
            return data;
        });

        // 3. Kirim data yang sudah dihitung
        res.json(liveBusData);

    } catch (err) {
        console.error("Error di getAllBus:", err.message);
        res.status(500).json({ message: err.message });
    }
};
// ------------------------------------------

// Mendapatkan bus berdasarkan ID (Tetap sama)
export const getBusById = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });
        res.json(bus);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui bus (Tetap sama)
export const updateBus = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });

        const { plat_nomor, kode_bus, kapasitas, jenis_bus, foto, status } = req.body;
        await bus.update({ plat_nomor, kode_bus, kapasitas, jenis_bus, foto, status });
        res.json(bus);
    } catch (err) {
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// Menghapus bus (Tetap sama)
export const deleteBus = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });

        await bus.destroy();
        res.json({ message: 'Bus berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};