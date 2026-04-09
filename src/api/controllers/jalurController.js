import Jalur from "../models/Jalur.js";
import Halte from "../models/Halte.js";

export const createJalur = async (req, res) => {
  const { nama_jalur, kode_jalur, rute_polyline, status } = req.body;

  // Validasi input
  if (!nama_jalur || !rute_polyline) {
    return res.status(400).json({
      message: "Validasi gagal: Nama jalur dan rute_polyline wajib diisi.",
    });
  }

  try {
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
      // Opsional: Kirim error detail hanya untuk kebutuhan log, hindari di production yang ketat
      error: error.message,
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
        message: `Data jalur dengan ID ${req.params.id} tidak ditemukan.`,
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
    const jalur = await Jalur.findByPk(req.params.id);
    if (!jalur) {
      return res.status(404).json({
        message: "Gagal memperbarui: Data jalur tidak ditemukan.",
      });
    }

    await jalur.update(req.body);

    res.status(200).json({
      message: "Data jalur berhasil diperbarui.",
      data: jalur,
    });
  } catch (error) {
    console.error(`❌ Error updateJalur (${req.params.id}):`, error);
    res.status(500).json({ message: error.message });
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

    // Penanganan khusus jika gagal hapus karena Foreign Key Constraint (Sedang dipakai di tabel lain)
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
