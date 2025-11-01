import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import { Op } from 'sequelize';
import dayjs from 'dayjs'; // Pastikan Anda sudah install dayjs

// Membuat driver baru
export const createDriver = async (req, res) => {
    const { kode_driver, nama, tanggal_lahir, nomor_telepon, foto, status } = req.body;

    try {
        const driver = await Driver.create({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto,
            status: status || 'berhenti',
        });
        res.status(201).json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getDrivers = async (req, res) => {
    try {
        const now = dayjs();
        const currentDate = now.format('YYYY-MM-DD');

        // 1. Ambil SEMUA driver, dan include jadwal HARI INI
        const allDrivers = await Driver.findAll({
            include: [{
                model: Schedule,
                as: 'jadwal',
                where: { tanggal: currentDate },
                required: false // PENTING: Lakukan LEFT JOIN
            }],
            order: [['nama', 'ASC']]
        });

        const updates = [];
        const driversToReturn = [];

        // 2. Loop melalui SETIAP driver
        for (const driver of allDrivers) {
            let highestPriority = 0; // 0 = berhenti
            let finalStatus = 'berhenti'; // Default status

            // 3. Cek jadwal HARI INI untuk driver ini
            // Jika driver.jadwal.length === 0, loop ini dilewati,
            // dan status tetap 'berhenti' (ini adalah reset otomatis)
            for (const s of driver.jadwal) {
                const start = dayjs(`${s.tanggal} ${s.jam_mulai}`);
                const end = dayjs(`${s.tanggal} ${s.jam_selesai}`);
                let scheduleStatusPriority = 0; // 0 = berhenti

                if (now.isAfter(start) && now.isBefore(end)) {
                    scheduleStatusPriority = 3; // berjalan
                } else if (now.isBefore(start)) {
                    scheduleStatusPriority = 2; // dijadwalkan
                }
                // Jika now.isAfter(end), priority tetap 0 (berhenti)

                if (scheduleStatusPriority > highestPriority) {
                    highestPriority = scheduleStatusPriority;
                }
            }

            // 4. Tentukan status final berdasarkan prioritas tertinggi
            if (highestPriority === 3) {
                finalStatus = 'berjalan';
            } else if (highestPriority === 2) {
                finalStatus = 'dijadwalkan';
            }
            // else: finalStatus tetap 'berhenti'

            // 5. Cek jika status di DB berbeda, siapkan update
            if (driver.status !== finalStatus) {
                // Jalankan update di background
                updates.push(
                    Driver.update({ status: finalStatus }, { where: { id_driver: driver.id_driver } })
                );
                // Perbarui juga objek driver agar data yang dikirim fresh
                driver.status = finalStatus;
            }

            // 6. Hapus data 'jadwal' dari output agar rapi
            const driverData = driver.toJSON();
            delete driverData.jadwal;
            driversToReturn.push(driverData);
        }

        // 7. Tunggu semua update selesai
        await Promise.all(updates);

        // 8. Kirim data driver yang sudah di-sync
        res.json(driversToReturn);

    } catch (err) {
        console.error('Error getDrivers:', err.message);
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan driver berdasarkan ID
export const getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });
        res.json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui driver
export const updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });

        // Hanya perbarui info personal, BUKAN status
        const { kode_driver, nama, tanggal_lahir, nomor_telepon, foto } = req.body;

        await driver.update({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto,
        });

        res.json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Menghapus driver
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