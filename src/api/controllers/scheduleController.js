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
      status: status || 'dijadwalkan', // <-- Sudah benar
    });
    res.status(201).json({
      message: 'Jadwal berhasil dibuat',
      data: schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan semua jadwal dengan sinkronisasi otomatis
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

    // --- Logika Sinkronisasi Status (Sudah Benar) ---
    for (const s of schedules) {
      const start = dayjs(`${s.tanggal} ${s.jam_mulai}`);
      const end = dayjs(`${s.tanggal} ${s.jam_selesai}`);
      let newStatus = 'dijadwalkan'; // Default untuk jadwal yang akan datang

      if (now.isAfter(start) && now.isBefore(end)) {
        newStatus = 'berjalan';
      } else if (now.isAfter(end)) {
        newStatus = 'berhenti';
      }
          
      if (s.status !== newStatus) {
        s.status = newStatus;
        await s.save();
      }
      if (s.bus_id) await Bus.update({ status: newStatus }, { where: { id_bus: s.bus_id } });
      if (s.driver_id) await Driver.update({ status: newStatus }, { where: { id_driver: s.driver_id } });
    }

    res.status(200).json({
      message: 'Berhasil mendapatkan semua jadwal',
      data: schedules,
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
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
    });

    if (!schedule) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });

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
