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
    const { plat_nomor, kode_bus, kapasitas, jenis_bus, status } = req.body;
    const foto = req.file ? req.file.filename : null;

    const bus = await Bus.create({
      plat_nomor, kode_bus, kapasitas, jenis_bus, foto,
      status: status || "berhenti",
    });

    res.status(201).json(bus);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- GET ALL BUS (LOGIKA PENENTU UTAMA) ---
export const getAllBus = async (req, res) => {
  try {
    const now = dayjs().tz("Asia/Jakarta");
    const today = now.format("YYYY-MM-DD");
    const timeNow = now.format("HH:mm:ss");

    // 1. Ambil Bus + Jadwal Hari Ini
    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: today },
          required: false, // Left Join (Bus tanpa jadwal tetap muncul)
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
      // --- LOGIKA STATUS BARU (STRICT SCHEDULE) ---
      let calculatedStatus = "berhenti"; // Default

      // Cek Kondisi
      const isMaintenance = bus.riwayat_perbaikan?.length > 0;
      let hasActiveSchedule = false;
      let hasFutureSchedule = false;

      if (bus.jadwal?.length > 0) {
        // Cek apakah jam SEKARANG masuk dalam rentang jadwal
        hasActiveSchedule = bus.jadwal.some(
          (j) => timeNow >= j.jam_mulai && timeNow <= j.jam_selesai
        );
        // Cek apakah ada jadwal NANTI (di masa depan hari ini)
        // Syarat: Belum masuk jam mulai, DAN tidak sedang ada jadwal aktif
        hasFutureSchedule = bus.jadwal.some((j) => timeNow < j.jam_mulai);
      }

      // --- HIERARKI PENENTUAN STATUS ---
      // 1. Prioritas Tertinggi: Maintenance
      if (isMaintenance) {
        calculatedStatus = "dalam perbaikan";
      }
      // 2. Prioritas Kedua: Sedang dalam jam operasional
      else if (hasActiveSchedule) {
        calculatedStatus = "berjalan";
      }
      // 3. Prioritas Ketiga: Ada jadwal nanti (tapi belum mulai)
      else if (hasFutureSchedule) {
        calculatedStatus = "dijadwalkan";
      }
      // 4. Sisanya: Berhenti (Jadwal sudah lewat atau tidak ada jadwal)
      else {
        calculatedStatus = "berhenti";
      }

      // --- UPDATE DATABASE OTOMATIS ---
      // Jika status hasil hitungan beda dengan database, update database!
      // Ini penting agar Dashboard Stats ikut berubah.
      if (bus.status !== calculatedStatus) {
        await bus.update({ status: calculatedStatus });
      }

      // Set value untuk response JSON
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
