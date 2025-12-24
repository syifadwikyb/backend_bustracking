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
    const currentDate = now.format("YYYY-MM-DD");
    const currentTime = now.format("HH:mm:ss");

    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: currentDate },
          required: false,
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

    const processedBuses = await Promise.all(
      buses.map(async (bus) => {
        // 1. Ambil status saat ini dari Database sebagai referensi
        let calculatedStatus = bus.status; 
        
        // Flag logic
        let isMaintenance = false;
        let isScheduleRunning = false;
        let isScheduleFuture = false;

        // Cek Maintenance
        if (bus.riwayat_perbaikan && bus.riwayat_perbaikan.length > 0) {
          isMaintenance = true;
        }

        // Cek Jadwal
        if (bus.jadwal && bus.jadwal.length > 0) {
          for (const s of bus.jadwal) {
            if (currentTime >= s.jam_mulai && currentTime <= s.jam_selesai) {
              isScheduleRunning = true;
              break; 
            }
            if (currentTime < s.jam_mulai) {
              isScheduleFuture = true;
            }
          }
        }

        // --- LOGIKA PENENTUAN STATUS BARU ---

        if (isMaintenance) {
          // Prioritas 1: Kalau rusak, ya rusak.
          calculatedStatus = "dalam perbaikan";
        } 
        else if (isScheduleRunning) {
          // Prioritas 2: Kalau jamnya cocok, otomatis BERJALAN.
          calculatedStatus = "berjalan";
        } 
        else if (bus.status === 'berjalan') {
          // ✅ PERBAIKAN DI SINI:
          // Jika jam tidak cocok, TAPI status di DB sudah 'berjalan' (mungkin di-set manual atau via GPS),
          // JANGAN diubah jadi berhenti. Biarkan tetap 'berjalan'.
          calculatedStatus = "berjalan"; 
        }
        else if (isScheduleFuture) {
          // Prioritas 3: Kalau belum waktunya dan belum berjalan, berarti DIJADWALKAN.
          calculatedStatus = "dijadwalkan";
        } 
        else {
          // Sisanya: Berhenti (Selesai tugas / tidak ada jadwal)
          calculatedStatus = "berhenti";
        }

        // Update Database hanya jika status berubah
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
