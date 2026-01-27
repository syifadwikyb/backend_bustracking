import Bus from "../models/Bus.js";
import Schedule from "../models/Schedule.js";
import Driver from "../models/Driver.js";
import Jalur from "../models/Jalur.js";
import Maintenance from "../models/Maintenance.js";
import { Op } from "sequelize";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Konfigurasi Dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

// --- CREATE BUS ---
export const createBus = async (req, res) => {
  try {
    const { plat_nomor, kode_bus, kapasitas, jenis_bus, status } = req.body;
    const foto = req.file ? req.file.filename : null;

    if(!plat_nomor || !kode_bus) {
        return res.status(400).json({ message: "Plat nomor dan Kode bus wajib diisi" });
    }

    const bus = await Bus.create({
      plat_nomor,
      kode_bus,
      kapasitas,
      jenis_bus,
      foto,
      status: status || "berhenti",
    });

    res.status(201).json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- GET ALL BUS ---
export const getAllBus = async (req, res) => {
  try {
    const now = dayjs().tz("Asia/Jakarta");
    const today = now.format("YYYY-MM-DD");
    const timeNow = now.format("HH:mm:ss");

    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: today },
          required: false,
          order: [["jam_mulai", "ASC"]],
          include: [
            { model: Driver, as: "driver", attributes: ["nama"] },
            { model: Jalur, as: "jalur", attributes: ["nama_jalur"] },
          ],
        },
        {
          model: Maintenance,
          as: "riwayat_perbaikan",
          where: { status: { [Op.ne]: "selesai" } }, 
          required: false,
        },
      ],
      order: [["plat_nomor", "ASC"]],
    });
    
    const processedBuses = buses.map((busInstance) => {
        const bus = busInstance.toJSON(); 

        let calculatedStatus = "berhenti";
        const isMaintenance = bus.riwayat_perbaikan?.length > 0;
        let hasActiveSchedule = false;
        let hasFutureSchedule = false;

        if (bus.jadwal?.length > 0) {
            hasActiveSchedule = bus.jadwal.some(
                (j) => timeNow >= j.jam_mulai && timeNow <= j.jam_selesai
            );
            hasFutureSchedule = bus.jadwal.some((j) => timeNow < j.jam_mulai);
        }

        if (isMaintenance) {
            calculatedStatus = "dalam perbaikan";
        } else if (hasActiveSchedule) {
            calculatedStatus = "berjalan";
        } else if (hasFutureSchedule) {
            calculatedStatus = "dijadwalkan";
        } else {
            calculatedStatus = "berhenti";
        }

        bus.status = calculatedStatus;

        const currentSchedule = bus.jadwal?.[0] || {};
        bus.nama_jalur = currentSchedule.jalur?.nama_jalur || "-";
        bus.nama_driver = currentSchedule.driver?.nama || "-";

        return bus;
    });

    res.json(processedBuses);
  } catch (err) {
    console.error("getAllBus error:", err);
    res.status(500).json({ message: "Gagal memuat data bus" });
  }
};

// --- GET BUS BY ID ---
export const getBusById = async (req, res) => {
  try {
    const bus = await Bus.findByPk(req.params.id);
    if (!bus) return res.status(404).json({ message: "Bus tidak ditemukan" });
    res.json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- UPDATE BUS ---
export const updateBus = async (req, res) => {
  try {
    const bus = await Bus.findByPk(req.params.id);
    if (!bus) return res.status(404).json({ message: "Bus tidak ditemukan" });

    const { plat_nomor, kode_bus, kapasitas, jenis_bus, status } = req.body;
    const fotoFinal = req.file ? req.file.filename : bus.foto; 

    await bus.update({
      plat_nomor,
      kode_bus,
      kapasitas,
      jenis_bus,
      foto: fotoFinal,
      status: status || bus.status,
    });

    res.json({ message: "Bus berhasil diperbarui", data: bus });
  } catch (err) {
    if (err.name === "SequelizeValidationError") {
      return res.status(400).json({ message: err.errors.map((e) => e.message).join(", ") });
    }
    res.status(500).json({ message: err.message });
  }
};

// --- DELETE BUS ---
export const deleteBus = async (req, res) => {
  try {
    const bus = await Bus.findByPk(req.params.id);
    if (!bus) return res.status(404).json({ message: "Bus tidak ditemukan" });

    await bus.destroy();
    res.json({ message: "Bus berhasil dihapus" });
  } catch (err) {
    if(err.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({ message: "Tidak dapat menghapus bus karena masih memiliki riwayat jadwal/tracking." });
    }
    res.status(500).json({ message: err.message });
  }
};