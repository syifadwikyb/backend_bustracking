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

    // 1. Ambil SEMUA data bus (gunakan required: false agar Left Join)
    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: today },
          required: false, // PENTING: Agar bus tanpa jadwal tetap muncul
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

    const processedBuses = [];

    for (const bus of buses) {
      // Status default awal (jika tidak ada kondisi lain)
      let calculatedStatus = "berhenti";

      // Cek flag kondisi
      const isMaintenance = bus.riwayat_perbaikan?.length > 0;
      let isRunningBySchedule = false;
      let isScheduledFuture = false;

      if (bus.jadwal?.length > 0) {
        isRunningBySchedule = bus.jadwal.some(
          (j) => timeNow >= j.jam_mulai && timeNow <= j.jam_selesai
        );
        isScheduledFuture = bus.jadwal.some((j) => timeNow < j.jam_mulai);
      }

      // --- LOGIKA PRIORITAS STATUS ---

      if (isMaintenance) {
        // Prioritas 1: Sedang Maintenance
        calculatedStatus = "dalam perbaikan";
      } else if (isRunningBySchedule) {
        // Prioritas 2: Jadwalnya pas jam sekarang
        calculatedStatus = "berjalan";
      } else if (bus.status === "berjalan") {
        // ✅ FIX UTAMA: MANUAL OVERRIDE / BROKER OFF
        // Jika jadwal tidak cocok, TAPI di database statusnya sudah 'berjalan'
        // (entah diset manual atau sisa data lama), JANGAN DIUBAH.
        // Biarkan tetap 'berjalan' agar sinkron dengan daftar bus.
        calculatedStatus = "berjalan";
      } else if (isScheduledFuture) {
        // Prioritas 3: Jadwal masa depan
        calculatedStatus = "dijadwalkan";
      } else {
        // Prioritas 4: Tidak ada jadwal / jadwal sudah lewat
        calculatedStatus = "berhenti";
      }

      // Update DB hanya jika status hasil hitungan berbeda dengan yang ada
      if (bus.status !== calculatedStatus) {
        await bus.update({ status: calculatedStatus });
      }

      // Set value untuk dikirim ke frontend
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
