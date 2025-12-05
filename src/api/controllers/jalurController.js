import Jalur from '../models/Jalur.js';
import Halte from '../models/Halte.js';

export const createJalur = async (req, res) => {
    const { nama_jalur, kode_jalur, rute_polyline, status } = req.body;

    if (!nama_jalur || !rute_polyline) {
        return res.status(400).json({ message: 'Nama jalur dan rute_polyline (koordinat) dibutuhkan' });
    }

    try {
        const jalur = await Jalur.create({
            nama_jalur,
            kode_jalur,
            rute_polyline,
            status
        });

        res.status(201).json(jalur);
    } catch (error) {
        console.error("Error saat membuat jalur:", error);
        res.status(500).json({ message: 'Error pada server', error: error.message });
    }
};

export const getAllJalur = async (req, res) => {
    try {
        const jalur = await Jalur.findAll({
            attributes: ['id_jalur', 'nama_jalur', 'kode_jalur', 'status, rute_polyline'],
        });
        res.json(jalur);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getJalurById = async (req, res) => {
    try {
        const jalur = await Jalur.findByPk(req.params.id, {
            include: [{
                model: Halte,
                as: 'halte' // 'through' tidak diperlukan lagi
            }]
        });
        if (!jalur) return res.status(404).json({ message: 'Jalur tidak ditemukan' });

        res.json(jalur);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Fungsi update bisa dimodifikasi untuk menerima rute_polyline baru juga
export const updateJalur = async (req, res) => {
    try {
        const jalur = await Jalur.findByPk(req.params.id);
        if (!jalur) {
            return res.status(404).json({ message: 'Jalur tidak ditemukan' });
        }

        await jalur.update(req.body);
        res.json(jalur);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const deleteJalur = async (req, res) => {
    try {
        const jalur = await Jalur.findByPk(req.params.id);
        if (!jalur) {
            return res.status(404).json({ message: 'Jalur tidak ditemukan' });
        }

        await jalur.destroy();
        res.json({ message: 'Jalur berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

