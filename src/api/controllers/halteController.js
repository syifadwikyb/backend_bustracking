import Halte from '../models/Halte.js';
import Jalur from '../models/Jalur.js';

// --- CREATE HALTE ---
export const createHalte = async (req, res) => {
    // 1. Ambil 'urutan' dari body
    const { nama_halte, latitude, longitude, jalur_id, urutan } = req.body;

    // 2. Validasi input (termasuk urutan)
    if (!nama_halte || !latitude || !longitude || !jalur_id || urutan === undefined) {
        return res.status(400).json({
            message: 'Semua field (nama, latitude, longitude, jalur_id, urutan) wajib diisi'
        });
    }

    try {
        const halte = await Halte.create({
            nama_halte,
            latitude,
            longitude,
            jalur_id,
            urutan // 3. Simpan urutan
        });
        res.status(201).json(halte);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// --- GET ALL HALTE ---
export const getAllHalte = async (req, res) => {
    try {
        const halte = await Halte.findAll({
            include: [
                {
                    model: Jalur,
                    as: 'jalur',
                    attributes: ['nama_jalur']
                }
            ],
            // 4. Urutkan berdasarkan jalur_id dulu, baru berdasarkan nomor urut halte
            order: [
                ['jalur_id', 'ASC'],
                ['urutan', 'ASC']
            ]
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
        if (!halte) return res.status(404).json({ message: 'Halte not found' });
        res.json(halte);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// --- UPDATE HALTE ---
export const updateHalte = async (req, res) => {
    try {
        const halte = await Halte.findByPk(req.params.id);
        if (!halte) return res.status(404).json({ message: 'Halte not found' });

        // Update otomatis menghandle field 'urutan' jika dikirim di req.body
        await halte.update(req.body);
        res.json(halte);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// --- DELETE HALTE ---
export const deleteHalte = async (req, res) => {
    try {
        const halte = await Halte.findByPk(req.params.id);
        if (!halte) return res.status(404).json({ message: 'Halte not found' });

        await halte.destroy();
        res.json({ message: 'Halte deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};