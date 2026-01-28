import Schedule from "../models/Schedule.js";
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import Jalur from "../models/Jalur.js";
import { Op } from "sequelize";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const checkScheduleConflict = async (bus_id, driver_id, tanggal, jam_mulai, jam_selesai, excludeId = null) => {
    
    const whereClause = {
        tanggal: tanggal,
        [Op.and]: [
            { jam_mulai: { [Op.lt]: jam_selesai } },
            { jam_selesai: { [Op.gt]: jam_mulai } }
        ],

        [Op.or]: [
            { bus_id: bus_id },
            { driver_id: driver_id }
        ]
    };

    if (excludeId) {
        whereClause.id_schedule = { [Op.ne]: excludeId };
    }

    const conflict = await Schedule.findOne({
        where: whereClause,
        include: [
            { model: Bus, as: 'bus', attributes: ['plat_nomor'] },
            { model: Driver, as: 'driver', attributes: ['nama'] }
        ]
    });

    return conflict;
};

// --- CREATE SCHEDULE ---
export const createSchedule = async (req, res) => {
  const { bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status } = req.body;

  try {
    if (jam_mulai >= jam_selesai) {
        return res.status(400).json({ message: "Jam selesai harus lebih besar dari jam mulai" });
    }

    const conflict = await checkScheduleConflict(bus_id, driver_id, tanggal, jam_mulai, jam_selesai);
    
    if (conflict) {
        let msg = "Terjadi bentrok jadwal! ";
        if (conflict.bus_id == bus_id) msg += `Bus ${conflict.bus.plat_nomor} sudah ada jadwal di jam tersebut. `;
        if (conflict.driver_id == driver_id) msg += `Driver ${conflict.driver.nama} sudah ada jadwal di jam tersebut.`;
        return res.status(409).json({ message: msg });
    }

    const schedule = await Schedule.create({
      bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai,
      status: status || "dijadwalkan",
    });

    res.status(201).json({ message: "Jadwal berhasil dibuat", data: schedule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- GET ALL SCHEDULES ---
export const getAllSchedules = async (req, res) => {
  try {
    const timeZone = "Asia/Jakarta";
    const now = dayjs().tz(timeZone);
    const schedules = await Schedule.findAll({
      include: [
        { model: Bus, as: 'bus', attributes: ['id_bus', 'plat_nomor', 'kode_bus'] },
        { model: Driver, as: 'driver', attributes: ['id_driver', 'nama'] },
        { model: Jalur, as: 'jalur', attributes: ['id_jalur', 'nama_jalur'] },
      ],
      order: [['tanggal', 'DESC'], ['jam_mulai', 'ASC']]
    });

    const processedData = schedules.map(s => {
        const item = s.toJSON();
        const dateStr = dayjs(item.tanggal).format('YYYY-MM-DD'); 
        const start = dayjs.tz(`${dateStr} ${item.jam_mulai}`, "YYYY-MM-DD HH:mm:ss", timeZone);
        const end = dayjs.tz(`${dateStr} ${item.jam_selesai}`, "YYYY-MM-DD HH:mm:ss", timeZone);

        let calculatedStatus = item.status;

        if (start.isValid() && end.isValid()) {
            if (now.isAfter(start) && now.isBefore(end)) {
                calculatedStatus = 'berjalan';
            } else if (now.isAfter(end)) {
                calculatedStatus = 'selesai';
            } else {
                calculatedStatus = 'dijadwalkan';
            }
        }
        
        item.status = calculatedStatus;
        return item;
    });

    res.status(200).json(processedData);

  } catch (err) {
    console.error("Error getAllSchedules:", err);
    res.status(500).json({ message: "Gagal memuat jadwal" });
  }
};

// --- GET BY ID ---
export const getScheduleById = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id, {
      include: [
        { model: Bus, as: "bus" },
        { model: Driver, as: "driver" },
        { model: Jalur, as: "jalur" },
      ],
    });

    if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });

    res.status(200).json(schedule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- UPDATE SCHEDULE ---
export const updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });

    const { bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status } = req.body;

    if (jam_mulai && jam_selesai && jam_mulai >= jam_selesai) {
        return res.status(400).json({ message: "Jam selesai harus lebih besar dari jam mulai" });
    }

    const conflict = await checkScheduleConflict(
        bus_id || schedule.bus_id, 
        driver_id || schedule.driver_id, 
        tanggal || schedule.tanggal, 
        jam_mulai || schedule.jam_mulai, 
        jam_selesai || schedule.jam_selesai,
        req.params.id
    );

    if (conflict) {
        return res.status(409).json({ message: "Gagal edit: Terjadi bentrok jadwal dengan ID " + conflict.id_schedule });
    }

    await schedule.update({
      bus_id, driver_id, jalur_id, tanggal, jam_mulai, jam_selesai, status,
    });

    res.status(200).json({ message: "Jadwal berhasil diperbarui", data: schedule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- DELETE ---
export const deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ message: "Jadwal tidak ditemukan" });

    await schedule.destroy();
    res.status(200).json({ message: "Jadwal berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};