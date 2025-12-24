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
    // 1. Tentukan Waktu Sekarang (Zona Jakarta)
    const now = dayjs().tz("Asia/Jakarta");
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm:ss");

    // 2. Ambil Bus + Jadwal Hari Ini + Maintenance Aktif
    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: currentDate }, // Hanya ambil jadwal hari ini
          required: false, // LEFT JOIN (Bus tetap tampil meski tidak ada jadwal)
          include: [
            { model: Driver, as: "driver", attributes: ["nama"] },
            { model: Jalur, as: "jalur", attributes: ["nama_jalur"] },
          ],
        },
        {
          model: Maintenance,
          as: "riwayat_perbaikan",
          where: { status: { [Op.ne]: "selesai" } }, // Ambil maintenance yg belum selesai
          required: false,
        },
      ],
      order: [["plat_nomor", "ASC"]],
    });

    // 3. Loop & Hitung Status Real-time
    const processedBuses = await Promise.all(
      buses.map(async (bus) => {
        let calculatedStatus = "berhenti"; // Default Status (PENTING!)

        // Prioritas 1: Maintenance
        if (bus.riwayat_perbaikan && bus.riwayat_perbaikan.length > 0) {
          calculatedStatus = "dalam perbaikan";
        }
        // Prioritas 2: Cek Jadwal
        else if (bus.jadwal && bus.jadwal.length > 0) {
          let isRunning = false;
          let isScheduled = false;

          for (const s of bus.jadwal) {
            // Cek jika jam sekarang masuk rentang jadwal
            if (currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
              isRunning = true;
              break; // Ketemu jadwal aktif, langsung stop
            }
            // Cek jika ada jadwal masa depan
            if (currentTime < s.jam_mulai) {
              isScheduled = true;
            }
          }

          if (isRunning) {
            calculatedStatus = "berjalan";
          } else if (isScheduled) {
            calculatedStatus = "dijadwalkan";
          }
          // Jika tidak running dan tidak scheduled (misal jadwal sudah lewat semua),
          // maka calculatedStatus tetap "berhenti" (default di atas)
        }

        // 4. Update Database jika beda
        if (bus.status !== calculatedStatus) {
          await bus.update({ status: calculatedStatus });
          bus.setDataValue("status", calculatedStatus);
        }

        return bus;
      })
    );

    res.json(processedBuses);
  } catch (err) {
    console.error("Error getAllBus:", err);
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
