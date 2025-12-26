import Bus from "../models/Bus.js";
import Schedule from "../models/Schedule.js";
import Driver from "../models/Driver.js";
import Jalur from "../models/Jalur.js";
import Maintenance from "../models/Maintenance.js";
import { Op } from "sequelize";

// Import Dayjs & Plugin Timezone
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

// Konfigurasi Dayjs
dayjs.extend(utc);
dayjs.extend(timezone);

// --- CREATE BUS ---
export const createBus = async (req, res) => {
  try {
    // Data teks otomatis masuk ke req.body berkat Multer
    const { plat_nomor, kode_bus, kapasitas, jenis_bus, status } = req.body;

    // Data file masuk ke req.file
    const foto = req.file ? req.file.filename : null;

    const bus = await Bus.create({
      plat_nomor,
      kode_bus,
      kapasitas,
      jenis_bus,
      foto,
      status: status || "berhenti", // Default status
    });

    res.status(201).json(bus);
  } catch (err) {
    if (err.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json({ message: err.errors.map((e) => e.message).join(", ") });
    }
    res.status(500).json({ message: err.message });
  }
};

// --- GET ALL BUS (LOGIKA STATUS DINAMIS) ---
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
          // Pindahkan where status ke dalam sini, TAPI...
          // Pastikan required: false agar bus tanpa jadwal tetap muncul
          where: {
            tanggal: today,
            status: { [Op.in]: ["berjalan", "dijadwalkan"] },
          },
          required: false, // <--- PENTING: LEFT JOIN (Bus tetap diambil meski tidak ada jadwal)
          include: [
            { model: Driver, as: "driver", attributes: ["nama"] },
            { model: Jalur, as: "jalur", attributes: ["nama_jalur"] },
          ],
        },
        {
          model: Maintenance,
          as: "riwayat_perbaikan",
          where: { status: { [Op.ne]: "selesai" } },
          required: false, // <--- PENTING: LEFT JOIN
        },
      ],
      order: [["plat_nomor", "ASC"]],
    });

    const processedBuses = [];

    for (const bus of buses) {
      let calculatedStatus = "berhenti"; // Default status jika tidak ada kondisi lain

      // ... (Logika kalkulasi status di bawahnya sudah benar) ...
      // PRIORITAS 1 — MAINTENANCE
      if (bus.riwayat_perbaikan?.length > 0) {
        calculatedStatus = "dalam perbaikan";
      }
      // PRIORITAS 2 — JADWAL
      else if (bus.jadwal?.length > 0) {
        const running = bus.jadwal.some(
          (j) => timeNow >= j.jam_mulai && timeNow <= j.jam_selesai
        );
        const scheduled = bus.jadwal.some((j) => timeNow < j.jam_mulai);

        if (running) calculatedStatus = "berjalan";
        else if (scheduled) calculatedStatus = "dijadwalkan";
      }
      // PRIORITAS 3 — MANUAL / EXISTING STATUS (Tambahan untuk keamanan)
      // Jika database sudah bilang 'berjalan' (misal dari MQTT), jangan di-overwrite jadi berhenti
      // KECUALI jika memang tidak ada jadwal aktif.
      // Namun, jika Anda ingin dashboard strictly ikut jadwal, abaikan blok ini.

      // SINKRONISASI DB
      if (bus.status !== calculatedStatus) {
        await bus.update({ status: calculatedStatus });
      }

      bus.setDataValue("status", calculatedStatus);
      processedBuses.push(bus);
    }

    res.json(processedBuses);
  } catch (err) {
    console.error("getAllBus error:", err);
    res.status(500).json({ message: err.message });
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

    // Cek jika ada foto baru diupload (dari middleware multer)
    const fotoFinal = req.file ? req.file.filename : bus.foto; // Pakai foto baru ATAU foto lama

    await bus.update({
      plat_nomor,
      kode_bus,
      kapasitas,
      jenis_bus,
      foto: fotoFinal,
      status: status || bus.status, // Gunakan status baru ATAU status lama
    });

    res.json(bus);
  } catch (err) {
    if (err.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json({ message: err.errors.map((e) => e.message).join(", ") });
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
    res.status(500).json({ message: err.message });
  }
};
