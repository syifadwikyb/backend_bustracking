import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// --- CREATE DRIVER ---
export const createDriver = async (req, res) => {
    try {
        const { kode_driver, nama, tanggal_lahir, nomor_telepon, status } = req.body;
        const foto = req.file ? req.file.filename : null;

        const existing = await Driver.count({ where: { kode_driver } });
        if (existing > 0) return res.status(400).json({ message: "Kode Driver sudah ada" });

        const driver = await Driver.create({
            kode_driver, nama, tanggal_lahir, nomor_telepon, foto,
            status: status || 'berhenti',
        });
        res.status(201).json(driver);
    } catch (err) {
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// --- GET ALL DRIVERS ---
export const getDrivers = async (req, res) => {
    try {
        const now = dayjs().tz("Asia/Jakarta");
        const currentDate = now.format('YYYY-MM-DD');
        const currentTime = now.format('HH:mm:ss');

        const drivers = await Driver.findAll({
            include: [{
                model: Schedule,
                as: 'jadwal',
                where: { tanggal: currentDate },
                required: false 
            }],
            order: [['nama', 'ASC']]
        });

        const processedDrivers = drivers.map((driverInstance) => {
            const driver = driverInstance.toJSON();
            let calculatedStatus = 'berhenti';

            if (driver.jadwal && driver.jadwal.length > 0) {
                let isRunning = false;
                let isScheduled = false;

                for (const s of driver.jadwal) {
                    if (currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
                        isRunning = true;
                        break;
                    }
                    if (currentTime < s.jam_mulai) {
                        isScheduled = true;
                    }
                }

                if (isRunning) calculatedStatus = 'berjalan';
                else if (isScheduled) calculatedStatus = 'dijadwalkan';
            }

            driver.status = calculatedStatus;
            delete driver.jadwal;
            return driver;
        });

        res.json(processedDrivers);

    } catch (err) {
        console.error('Error getDrivers:', err);
        res.status(500).json({ message: "Gagal memuat data driver" });
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
        const fotoFinal = req.file ? req.file.filename : driver.foto;

        await driver.update({
            kode_driver, nama, tanggal_lahir, nomor_telepon,
            foto: fotoFinal,
            status: status || driver.status 
        });

        res.json({ message: "Driver berhasil diperbarui", data: driver });
    } catch (err) {
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