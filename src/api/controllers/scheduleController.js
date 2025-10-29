import Schedule from '../models/Schedule.js';
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Jalur from '../models/Jalur.js';
import dayjs from "dayjs";

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
        res.status(201).json({
            message: "Jadwal berhasil dibuat",
            data: schedule
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua jadwal dengan detail lengkap
export const getAllSchedules = async (req, res) => {
  try {
    const now = dayjs(); // waktu sekarang

    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' }
      ]
    });

    // Ubah status otomatis sesuai waktu
    for (const s of schedules) {
      const start = dayjs(`${s.tanggal} ${s.jam_mulai}`);
      const end = dayjs(`${s.tanggal} ${s.jam_selesai}`);

      if (now.isAfter(start) && now.isBefore(end)) {
        // bus sedang berjalan
        if (s.status !== 'berjalan') {
          s.status = 'berjalan';
          await s.save();
        }
      } else if (now.isAfter(end)) {
        // bus sudah berhenti
        if (s.status !== 'berhenti') {
          s.status = 'berhenti';
          await s.save();
        }
      } else {
        // belum mulai
        if (s.status !== 'dijadwalkan') {
          s.status = 'dijadwalkan';
          await s.save();
        }
      }
    }

    res.status(200).json({
      message: "Berhasil mendapatkan semua jadwal",
      data: schedules
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan jadwal berdasarkan ID
export const getScheduleById = async (req, res) => {
    try {
        const schedule = await Schedule.findByPk(req.params.id, {
            include: [
                { 
                    model: Bus, 
                    as: 'bus', 
                    attributes: ['kode_bus', 'plat_nomor', 'jenis_bus', 'foto', 'status'] 
                },
                { 
                    model: Driver, 
                    as: 'driver', 
                    attributes: ['kode_driver', 'nama', 'nomor_telepon', 'foto', 'status'] 
                },
                { 
                    model: Jalur, 
                    as: 'jalur', 
                    attributes: ['kode_jalur', 'nama_jalur', 'status'] 
                }
            ]
        });

        if (!schedule) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }

        res.status(200).json({
            message: "Berhasil mendapatkan jadwal",
            data: schedule
        });
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

        res.status(200).json({
            message: "Jadwal berhasil diperbarui",
            data: schedule
        });
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
        res.status(200).json({ message: 'Jadwal berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
