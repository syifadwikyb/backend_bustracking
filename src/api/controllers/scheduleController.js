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


export const getAllSchedules = async (req, res) => {
  try {
    const now = dayjs();

    // 1. Ambil semua jadwal
    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
    });

    // 2. Loop untuk cek waktu dan sinkronisasi status
    for (const s of schedules) {
      const start = dayjs(`${s.tanggal} ${s.jam_mulai}`);
      const end = dayjs(`${s.tanggal} ${s.jam_selesai}`);

      // Default status jadwal
      let newScheduleStatus = 'dijadwalkan';

      if (!start.isValid() || !end.isValid()) continue;

      // Logika Penentuan Status JADWAL
      if (now.isAfter(start) && now.isBefore(end)) {
        newScheduleStatus = 'berjalan';
      } else if (now.isAfter(end)) {
        newScheduleStatus = 'selesai';
      }

      // Update tabel JADWAL jika berubah
      if (s.status !== newScheduleStatus) {
        s.status = newScheduleStatus;
        await s.save();
      }

      // ---------------------------------------------------------
      // PERBAIKAN UTAMA (MAPPING STATUS)
      // Menerjemahkan status 'selesai' milik Jadwal 
      // menjadi 'berhenti' milik Bus & Driver.
      // ---------------------------------------------------------

      let targetBusStatus = 'berhenti';   // Default (Sesuai ENUM Bus)
      let targetDriverStatus = 'berhenti'; // Default (Sesuai ENUM Driver)

      if (newScheduleStatus === 'dijadwalkan') {
        targetBusStatus = 'dijadwalkan';
        targetDriverStatus = 'dijadwalkan';
      } else if (newScheduleStatus === 'berjalan') {
        targetBusStatus = 'berjalan';
        targetDriverStatus = 'berjalan';
      } else if (newScheduleStatus === 'selesai') {
        // INI KUNCINYA: Jangan kirim 'selesai', tapi kirim 'berhenti'
        targetBusStatus = 'berhenti';
        targetDriverStatus = 'berhenti';
      }

      // Update BUS (Hanya jika ID valid & status beda)
      if (s.bus_id && s.bus?.status !== targetBusStatus) {
        try {
          await Bus.update(
            { status: targetBusStatus },
            { where: { id_bus: s.bus_id } }
          );
        } catch (error) {
          console.error(`Gagal update Bus ID ${s.bus_id}:`, error.message);
        }
      }

      // Update DRIVER (Hanya jika ID valid & status beda)
      if (s.driver_id && s.driver?.status !== targetDriverStatus) {
        try {
          await Driver.update(
            { status: targetDriverStatus },
            { where: { id_driver: s.driver_id } }
          );
        } catch (error) {
          console.error(`Gagal update Driver ID ${s.driver_id}:`, error.message);
        }
      }
    }

    // 3. Ambil data segar untuk dikirim ke frontend
    const updatedSchedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
      order: [['tanggal', 'DESC'], ['jam_mulai', 'ASC']]
    });

    res.status(200).json({
      message: 'Berhasil mendapatkan semua jadwal',
      data: updatedSchedules,
    });

  } catch (err) {
    console.error("Error getAllSchedules:", err);
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
