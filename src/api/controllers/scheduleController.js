import Schedule from '../models/Schedule.js';
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Jalur from '../models/Jalur.js';

// Membuat jadwal baru
export const createSchedule = async (req, res) => {
    const { bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status } = req.body;
    try {
        const schedule = await Schedule.create({
            bus_id,
            driver_id,
            jalur_id,
            tanggal,
            jam_mulai,
            jam_selesai,
            status
        });
        res.status(201).json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua jadwal dengan detailnya
export const getAllSchedules = async (req, res) => {
    try {
        const schedules = await Schedule.findAll({
            include: [
                { model: Bus, as: 'bus', attributes: ['kode_bus', 'plat_nomor'] },
                { model: Driver, as: 'driver', attributes: ['kode_driver', 'nama'] },
                { model: Jalur, as: 'jalur', attributes: ['kode_jalur', 'nama_jalur'] }
            ],
            order: [['tanggal', 'DESC'], ['jam_mulai', 'ASC']]
        });
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getScheduleById = async (req, res) => {
    try {
        const schedule = await Schedule.findByPk(req.params.id, {
            // Sertakan juga detail dari bus, driver, dan jalur
            include: [
                { model: Bus, as: 'bus', attributes: ['kode_bus', 'plat_nomor'] },
                { model: Driver, as: 'driver', attributes: ['kode_driver', 'nama'] },
                { model: Jalur, as: 'jalur', attributes: ['kode_jalur', 'nama_jalur'] }
            ]
        });

        if (!schedule) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }

        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui jadwal
export const updateSchedule = async (req, res) => {
    try {
        const schedule = await Schedule.findByPk(req.params.id);

        if (!schedule) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }

        // Ambil field yang boleh di-update dari body
        const { bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status } = req.body;

        await schedule.update({
            bus_id,
            driver_id,
            jalur_id,
            tanggal,
            jam_mulai,
            jam_selesai,
            status
        });

        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Menghapus jadwal
export const deleteSchedule = async (req, res) => {
    try {
        const schedule = await Schedule.findByPk(req.params.id);

        if (!schedule) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }

        await schedule.destroy();
        res.json({ message: 'Jadwal berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};