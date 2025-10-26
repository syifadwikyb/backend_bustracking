import Maintenance from '../models/Maintenance.js';
import Bus from '../models/Bus.js';

// Membuat catatan maintenance baru
export const createMaintenance = async (req, res) => {
    // Sekarang kita menerima bus_id dari body
    const { bus_id, tanggal_perbaikan, deskripsi, status, harga } = req.body;

    try {
        const maintenance = await Maintenance.create({
            bus_id,
            tanggal_perbaikan,
            deskripsi,
            status,
            harga
        });

        // Update status bus berdasarkan kondisi maintenance
        if (status === 'sedang diperbaiki' || status === 'dijadwalkan') {
            await Bus.update({ status: 'dalam perbaikan' }, { where: { id_bus: bus_id } });
        }

        res.status(201).json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua riwayat maintenance
export const getAllMaintenance = async (req, res) => {
    try {
        const maintenances = await Maintenance.findAll({
            include: {
                model: Bus,
                as: 'bus',
                attributes: ['id_bus', 'plat_nomor', 'status']
            }
        });
        res.json(maintenances);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan satu catatan maintenance
export const getMaintenanceById = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id, {
            include: { model: Bus, as: 'bus' }
        });
        if (!maintenance) return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });
        res.json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Memperbarui catatan maintenance
export const updateMaintenance = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id);
        if (!maintenance) return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });

        const { tanggal_perbaikan, deskripsi, status, harga } = req.body;
        await maintenance.update({ tanggal_perbaikan, deskripsi, status, harga });

        if (status === 'selesai') {
            await Bus.update({ status: 'aktif' }, { where: { id_bus: maintenance.bus_id } });
        }

        res.json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Menghapus catatan maintenance
export const deleteMaintenance = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id);
        if (!maintenance) return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });

        await maintenance.destroy();
        res.json({ message: 'Catatan maintenance berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
