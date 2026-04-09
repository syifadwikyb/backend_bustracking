import Jalur from "../models/Jalur.js";
import Halte from "../models/Halte.js";
import { Op } from "sequelize";

export const createJalur = async (req, res) => {
  const { nama_jalur, kode_jalur, rute_polyline, status } = req.body;

  // Validasi input awal
  if (!nama_jalur || !rute_polyline) {
    return res.status(400).json({
      message: "Validasi gagal: Nama jalur dan rute_polyline wajib diisi.",
    });
  }

  try {
    // ✅ 1. Validasi Duplikat: Cek apakah NAMA JALUR sudah digunakan
    const cekNama = await Jalur.findOne({ where: { nama_jalur } });
    if (cekNama) {
      return res.status(400).json({
        message: `Nama jalur "${nama_jalur}" sudah ada. Silakan gunakan nama lain.`,
      });
    }

    // ✅ 2. Validasi Duplikat: Cek apakah KODE JALUR sudah digunakan
    if (kode_jalur) {
      // Hanya cek jika kode_jalur diisi
      const cekKode = await Jalur.findOne({ where: { kode_jalur } });
      if (cekKode) {
        return res.status(400).json({
          message: `Kode jalur "${kode_jalur}" sudah terpakai. Silakan gunakan kode lain.`,
        });
      }
    }

    // Lolos validasi, buat data baru
    const jalur = await Jalur.create({
      nama_jalur,
      kode_jalur,
      rute_polyline,
      status,
    });

    res.status(201).json({
      message: "Jalur berhasil dibuat.",
      data: jalur,
    });
  } catch (error) {
    console.error("❌ Error createJalur:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server saat membuat data jalur.",
    });
  }
};

export const getAllJalur = async (req, res) => {
  try {
    const jalur = await Jalur.findAll();
    res.status(200).json(jalur);
  } catch (error) {
    console.error("❌ Error getAllJalur:", error);
    res.status(500).json({
      message: "Gagal mengambil daftar jalur dari server.",
    });
  }
};

export const getJalurById = async (req, res) => {
  try {
    const jalur = await Jalur.findByPk(req.params.id, {
      include: [
        {
          model: Halte,
          as: "halte",
        },
      ],
    });

    if (!jalur) {
      return res.status(404).json({
        message: `Data jalur tidak ditemukan.`,
      });
    }

    res.status(200).json(jalur);
  } catch (error) {
    console.error(`❌ Error getJalurById (${req.params.id}):`, error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server saat mengambil detail jalur.",
    });
  }
};

export const updateJalur = async (req, res) => {
  try {
    const jalurId = req.params.id;
    const jalur = await Jalur.findByPk(jalurId);

    if (!jalur) {
      return res.status(404).json({
        message: "Gagal memperbarui: Data jalur tidak ditemukan.",
      });
    }

    const { nama_jalur, kode_jalur } = req.body;

    // ✅ 1. Validasi Update: Cek apakah NAMA JALUR bentrok dengan data lain
    if (nama_jalur && nama_jalur !== jalur.nama_jalur) {
      const cekNama = await Jalur.findOne({
        where: {
          nama_jalur,
          id_jalur: { [Op.ne]: jalurId }, // Asumsi primary key Anda 'id_jalur'. Ubah ke 'id' jika perlu.
        },
      });
      if (cekNama) {
        return res.status(400).json({
          message: `Nama jalur "${nama_jalur}" sudah digunakan oleh jalur lain.`,
        });
      }
    }

    // ✅ 2. Validasi Update: Cek apakah KODE JALUR bentrok dengan data lain
    if (kode_jalur && kode_jalur !== jalur.kode_jalur) {
      const cekKode = await Jalur.findOne({
        where: {
          kode_jalur,
          id_jalur: { [Op.ne]: jalurId },
        },
      });
      if (cekKode) {
        return res.status(400).json({
          message: `Kode jalur "${kode_jalur}" sudah digunakan oleh jalur lain.`,
        });
      }
    }

    // Lolos validasi, eksekusi update
    await jalur.update(req.body);

    res.status(200).json({
      message: "Data jalur berhasil diperbarui.",
      data: jalur,
    });
  } catch (error) {
    console.error(`❌ Error updateJalur (${req.params.id}):`, error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server saat memperbarui data jalur.",
    });
  }
};

export const deleteJalur = async (req, res) => {
  try {
    const jalur = await Jalur.findByPk(req.params.id);
    if (!jalur) {
      return res.status(404).json({
        message: "Gagal menghapus: Data jalur tidak ditemukan.",
      });
    }

    await jalur.destroy();
    res.status(200).json({
      message: `Jalur '${jalur.nama_jalur}' berhasil dihapus.`,
    });
  } catch (error) {
    console.error(`❌ Error deleteJalur (${req.params.id}):`, error);

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(409).json({
        message:
          "Gagal menghapus jalur karena sedang terhubung dengan data lain (misalnya sedang digunakan di Jadwal atau Halte).",
      });
    }

    res.status(500).json({
      message: "Terjadi kesalahan pada server saat menghapus data jalur.",
    });
  }
};
