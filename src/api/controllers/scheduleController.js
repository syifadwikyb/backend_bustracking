import Schedule from '../models/Schedule.js';
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Jalur from '../models/Jalur.js';
import dayjs from 'dayjs';

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
      status: status || 'dijadwalkan',
    });

    res.status(201).json({
      message: 'Jadwal berhasil dibuat',
      data: schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan semua jadwal + update otomatis status
// controller/scheduleController.js

export const getAllSchedules = async (req, res) => {
  try {
    const now = dayjs();

    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
    });

    for (const s of schedules) {
      const start = dayjs(`${s.tanggal} ${s.jam_mulai}`);
      const end = dayjs(`${s.tanggal} ${s.jam_selesai}`);
      let newStatus = 'dijadwalkan';

      // Validasi waktu
      if (!start.isValid() || !end.isValid()) continue;

      // 1. Tentukan Status JADWAL (Sesuai ENUM Schedule)
      if (now.isAfter(start) && now.isBefore(end)) {
        newStatus = 'berjalan';
      } else if (now.isAfter(end)) {
        newStatus = 'selesai';
      }

      // Update tabel Schedule jika berubah
      if (s.status !== newStatus) {
        s.status = newStatus;
        await s.save();
      }

      let busStatus = 'tersedia';   // Default jika jadwal selesai/belum mulai
      let driverStatus = 'aktif';   // Default driver standby

      if (newStatus === 'berjalan') {
        // Sesuaikan kata 'beroperasi' dengan ENUM di model Bus.js Anda
        busStatus = 'beroperasi';        
        driverStatus = 'bertugas';
      }

      // Update Bus (Hanya jika status berubah & ID valid)
      if (s.bus_id && s.bus?.status !== busStatus) {
        // Cek dulu apakah tabel Bus Anda punya kolom 'status'
        try {
          await Bus.update({ status: busStatus }, { where: { id_bus: s.bus_id } });
        } catch (error) {
          console.error("Gagal update status Bus. Cek ENUM di model Bus:", error.message);
        }
      }

      // Update Driver
      if (s.driver_id && s.driver?.status !== driverStatus) {
        try {
          await Driver.update({ status: driverStatus }, { where: { id_driver: s.driver_id } });
        } catch (error) {
          console.error("Gagal update status Driver. Cek ENUM di model Driver:", error.message);
        }
      }
    }

    // Ambil data terbaru untuk dikirim ke frontend
    const updatedSchedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
      order: [['tanggal', 'DESC'], ['jam_mulai', 'ASC']] // Opsional: Biar rapi
    });

    res.status(200).json({
      message: 'Berhasil mendapatkan semua jadwal',
      data: updatedSchedules,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan jadwal berdasarkan ID
export const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id, {
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
    }

    res.status(200).json({
      message: 'Berhasil mendapatkan jadwal',
      data: schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Memperbarui jadwal
export const updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });

    const { bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status } = req.body;

    await schedule.update({
      bus_id,
      driver_id,
      jalur_id,
      tanggal,
      jam_mulai,
      jam_selesai,
      status,
    });

    res.status(200).json({
      message: 'Jadwal berhasil diperbarui',
      data: schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Menghapus jadwal
export const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });

    await schedule.destroy();
    res.status(200).json({ message: 'Jadwal berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
