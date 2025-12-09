import Schedule from '../models/Schedule.js';
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Jalur from '../models/Jalur.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

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
    // 1. Tentukan Zona Waktu Target (WIB)
    const timeZone = "Asia/Jakarta";
    const now = dayjs().tz(timeZone); // Waktu sekarang di Jakarta

    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
    });

    for (const s of schedules) {
      // 2. Format Tanggal agar aman (antisipasi format Date Object)
      const dateStr = dayjs(s.tanggal).format('YYYY-MM-DD'); 
      
      // 3. Gabungkan Tanggal + Jam, lalu PAKSA baca sebagai waktu Jakarta
      // Format string harus jelas agar tidak dianggap UTC
      const start = dayjs.tz(`${dateStr} ${s.jam_mulai}`, "YYYY-MM-DD HH:mm:ss", timeZone);
      const end = dayjs.tz(`${dateStr} ${s.jam_selesai}`, "YYYY-MM-DD HH:mm:ss", timeZone);

      let newScheduleStatus = 'dijadwalkan';

      if (!start.isValid() || !end.isValid()) continue;

      // Logika Penentuan Status
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

      // --- Logika Update Bus & Driver (Sama seperti sebelumnya) ---
      let targetStatus = 'berhenti';
      if (newScheduleStatus === 'dijadwalkan') targetStatus = 'dijadwalkan';
      if (newScheduleStatus === 'berjalan') targetStatus = 'berjalan';
      if (newScheduleStatus === 'selesai') targetStatus = 'berhenti';

      if (s.bus_id && s.bus?.status !== targetStatus) {
          await Bus.update({ status: targetStatus }, { where: { id_bus: s.bus_id } });
      }
      if (s.driver_id && s.driver?.status !== targetStatus) {
          await Driver.update({ status: targetStatus }, { where: { id_driver: s.driver_id } });
      }
    }

    // Ambil data terbaru untuk dikirim ke frontend
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
