// src/api/controllers/maintenanceController.js

import Maintenance from '../models/Maintenance.js';
import Bus from '../models/Bus.js';

// Membuat catatan maintenance baru
export const createMaintenance = async (req, res) => {
    // Sekarang kita menerima kode_bus, bukan bus_id
    const { kode_bus, tanggal_perbaikan, deskripsi, status, harga } = req.body;
    try {
        const maintenance = await Maintenance.create({
            kode_bus,
            tanggal_perbaikan,
            deskripsi,
            status,
            harga
        });

        // Update status bus berdasarkan kode_bus
        if (status === 'sedang diperbaiki' || status === 'dijadwalkan') {
            await Bus.update({ status: 'dalam perbaikan' }, { where: { kode_bus: kode_bus } });
        }

        res.status(201).json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan semua riwayat maintenance (tidak ada perubahan signifikan di sini)
export const getAllMaintenance = async (req, res) => {
    try {
        const maintenances = await Maintenance.findAll({
            include: {
                model: Bus,
                as: 'bus',
                attributes: ['plat_nomor', 'kode_bus']
            }
        });
        res.json(maintenances);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Mendapatkan satu catatan maintenance (tidak ada perubahan signifikan di sini)
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

        // Update status bus berdasarkan kode_bus yang tersimpan di catatan maintenance
        if (status === 'selesai') {
            await Bus.update({ status: 'aktif' }, { where: { kode_bus: maintenance.kode_bus } });
        }

        res.json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Menghapus catatan maintenance (tidak ada perubahan)
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