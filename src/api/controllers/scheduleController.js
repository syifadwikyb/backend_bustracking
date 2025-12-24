import Schedule from "../models/Schedule.js";
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import Jalur from "../models/Jalur.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// Membuat jadwal baru
export const createSchedule = async (req, res) => {
  const {
    bus_id,
    driver_id,
    jalur_id,
    tanggal,
    jam_mulai,
    jam_selesai,
    status,
  } = req.body;

  try {
    const schedule = await Schedule.create({
      bus_id,
      driver_id,
      jalur_id,
      tanggal,
      jam_mulai,
      jam_selesai,
      status: status || "dijadwalkan",
    });

    res.status(201).json({
      message: "Jadwal berhasil dibuat",
      data: schedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllSchedules = async (req, res) => {
  try {
    const timeZone = "Asia/Jakarta";
    const now = dayjs().tz(timeZone);

    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus' },
        { model: Driver, as: 'driver' },
        { model: Jalur, as: 'jalur' },
      ],
      // PENTING: Order biar rapi
      order: [['tanggal', 'DESC'], ['jam_mulai', 'ASC']]
    });

    for (const s of schedules) {
      const dateStr = dayjs(s.tanggal).format('YYYY-MM-DD'); 
      const start = dayjs.tz(`${dateStr} ${s.jam_mulai}`, "YYYY-MM-DD HH:mm:ss", timeZone);
      const end = dayjs.tz(`${dateStr} ${s.jam_selesai}`, "YYYY-MM-DD HH:mm:ss", timeZone);

      let newScheduleStatus = 'dijadwalkan';

      if (!start.isValid() || !end.isValid()) continue;

      if (now.isAfter(start) && now.isBefore(end)) {
        newScheduleStatus = 'berjalan';
      } else if (now.isAfter(end)) {
        newScheduleStatus = 'selesai';
      }

      // Update tabel JADWAL saja
      if (s.status !== newScheduleStatus) {
        // Kita update instance 's' langsung
        await s.update({ status: newScheduleStatus });
      }
    }

    res.status(200).json({
      message: 'Berhasil mendapatkan semua jadwal',
      data: schedules,
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
        { model: Bus, as: "bus" },
        { model: Driver, as: "driver" },
        { model: Jalur, as: "jalur" },
      ],
    });

    if (!schedule) {
      return res.status(404).json({ message: "Jadwal tidak ditemukan" });
    }

    res.status(200).json({
      message: "Berhasil mendapatkan jadwal",
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
    if (!schedule)
      return res.status(404).json({ message: "Jadwal tidak ditemukan" });

    const {
      bus_id,
      driver_id,
      jalur_id,
      tanggal,
      jam_mulai,
      jam_selesai,
      status,
    } = req.body;

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
      message: "Jadwal berhasil diperbarui",
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
    if (!schedule)
      return res.status(404).json({ message: "Jadwal tidak ditemukan" });

    await schedule.destroy();
    res.status(200).json({ message: "Jadwal berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
