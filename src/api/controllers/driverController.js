import Driver from '../models/Driver.js';

// Membuat driver baru
export const createDriver = async (req, res) => {
    // Ambil hanya field yang kita harapkan dari body request
    const { kode_driver, nama, tanggal_lahir, nomor_telepon, foto, status } = req.body;

    try {
        const driver = await Driver.create({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto,
            status
        });
        res.status(201).json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua driver
export const getDrivers = async (req, res) => {
    try {
        const drivers = await Driver.findAll();
        res.json(drivers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan driver berdasarkan ID
export const getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });
        res.json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui driver
export const updateDriver = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });

        const { kode_driver, nama, tanggal_lahir, nomor_telepon, foto, status } = req.body;

        await driver.update({
            kode_driver,
            nama,
            tanggal_lahir,
            nomor_telepon,
            foto,
            status
        });
        res.json(driver);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Menghapus driver
export const deleteDriver = async (req, res) => {
    try {
        const driver = await Driver.findByPk(req.params.id);
        if (!driver) return res.status(404).json({ message: 'Driver tidak ditemukan' });

        await driver.destroy();
        res.json({ message: 'Driver berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};