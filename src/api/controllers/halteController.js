import Halte from "../models/Halte.js";
import Jalur from "../models/Jalur.js";
import { Op } from "sequelize"; // Wajib diimport untuk query [Op.ne] (Not Equal)

// --- CREATE HALTE ---
export const createHalte = async (req, res) => {
  const { nama_halte, latitude, longitude, jalur_id, urutan } = req.body;

  if (
    !nama_halte ||
    !latitude ||
    !longitude ||
    !jalur_id ||
    urutan === undefined
  ) {
    return res.status(400).json({
      message:
        "Semua field (nama, latitude, longitude, jalur_id, urutan) wajib diisi",
    });
  }

  try {
    // 1. Validasi: Cek apakah NAMA HALTE sudah ada di JALUR YANG SAMA
    const cekNama = await Halte.findOne({
      where: { jalur_id, nama_halte },
    });
    if (cekNama) {
      return res.status(400).json({
        message: `Halte dengan nama "${nama_halte}" sudah terdaftar pada jalur ini.`,
      });
    }

    // 2. Validasi: Cek apakah URUTAN sudah terpakai di JALUR YANG SAMA
    const cekUrutan = await Halte.findOne({
      where: { jalur_id, urutan },
    });
    if (cekUrutan) {
      return res.status(400).json({
        message: `Urutan ke-${urutan} sudah terpakai di jalur ini. Silakan gunakan urutan lain.`,
      });
    }

    // Lolos validasi, simpan data
    const halte = await Halte.create({
      nama_halte,
      latitude,
      longitude,
      jalur_id,
      urutan,
    });

    res.status(201).json(halte);
  } catch (err) {
    console.error("Error createHalte:", err);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server", error: err.message });
  }
};

// --- GET ALL HALTE ---
export const getAllHalte = async (req, res) => {
  try {
    const halte = await Halte.findAll({
      include: [
        {
          model: Jalur,
          as: "jalur",
          attributes: ["nama_jalur"],
        },
      ],
      order: [
        ["jalur_id", "ASC"],
        ["urutan", "ASC"],
      ],
    });
    res.json(halte);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- GET BY ID ---
export const getHalteById = async (req, res) => {
  try {
    const halte = await Halte.findByPk(req.params.id);
    if (!halte) return res.status(404).json({ message: "Halte not found" });
    res.json(halte);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- UPDATE HALTE ---
export const updateHalte = async (req, res) => {
  try {
    const halteId = req.params.id;
    const halte = await Halte.findByPk(halteId);

    if (!halte) return res.status(404).json({ message: "Halte not found" });

    // Ambil data dari body, jika tidak ada gunakan data lama yang ada di database
    const targetJalurId = req.body.jalur_id || halte.jalur_id;
    const targetNama = req.body.nama_halte || halte.nama_halte;
    const targetUrutan =
      req.body.urutan !== undefined ? req.body.urutan : halte.urutan;

    // 1. Validasi Update: Cek apakah NAMA HALTE bentrok di JALUR YANG SAMA
    const cekNama = await Halte.findOne({
      where: {
        jalur_id: targetJalurId,
        nama_halte: targetNama,
        id_halte: { [Op.ne]: halteId }, // Mengecualikan halte yang sedang di-edit itu sendiri
      },
    });
    if (cekNama) {
      return res.status(400).json({
        message: `Halte dengan nama "${targetNama}" sudah ada pada jalur ini.`,
      });
    }

    // 2. Validasi Update: Cek apakah URUTAN bentrok di JALUR YANG SAMA
    const cekUrutan = await Halte.findOne({
      where: {
        jalur_id: targetJalurId,
        urutan: targetUrutan,
        id_halte: { [Op.ne]: halteId }, // Mengecualikan halte yang sedang di-edit itu sendiri
      },
    });
    if (cekUrutan) {
      return res.status(400).json({
        message: `Urutan ke-${targetUrutan} sudah terpakai di jalur ini.`,
      });
    }

    // Lolos validasi, lakukan update
    await halte.update(req.body);
    res.json(halte);
  } catch (err) {
    console.error("Error updateHalte:", err);
    res.status(500).json({ message: err.message });
  }
};

// --- DELETE HALTE ---
export const deleteHalte = async (req, res) => {
  try {
    const halte = await Halte.findByPk(req.params.id);
    if (!halte) return res.status(404).json({ message: "Halte not found" });

    await halte.destroy();
    res.json({ message: "Halte deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
