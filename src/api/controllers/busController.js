import Bus from '../models/Bus.js';

// Membuat bus baru
export const createBus = async (req, res) => {
    const { plat_nomor, kode_bus, kapasitas, jenis_bus, foto, status } = req.body;

    try {
        const bus = await Bus.create({
            plat_nomor,
            kode_bus,
            kapasitas,
            jenis_bus,
            foto,
            status
        });
        res.status(201).json(bus);
    } catch (err) {
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua bus
export const getAllBus = async (req, res) => { // Nama fungsi dibuat lebih jelas
    try {
        const bus = await Bus.findAll();
        res.json(bus);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan bus berdasarkan ID
export const getBusById = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });
        res.json(bus);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui bus
export const updateBus = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });

        // Ambil hanya field yang boleh di-update
        const { plat_nomor, kode_bus, kapasitas, jenis_bus, foto, status } = req.body;

        await bus.update({
            plat_nomor,
            kode_bus,
            kapasitas,
            jenis_bus,
            foto,
            status
        });
        res.json(bus);
    } catch (err) {
        if (err.name === 'SequelizeValidationError') {
            return res.status(400).json({ message: err.errors.map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: err.message });
    }
};

// Menghapus bus
export const deleteBus = async (req, res) => {
    try {
        const bus = await Bus.findByPk(req.params.id);
        if (!bus) return res.status(404).json({ message: 'Bus tidak ditemukan' });

        await bus.destroy();
        res.json({ message: 'Bus berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};