import Maintenance from '../models/Maintenance.js';
import Bus from '../models/Bus.js';
import { Op } from 'sequelize';

// 🔹 CREATE
export const createMaintenance = async (req, res) => {
    const { bus_id, tanggal_perbaikan, tanggal_selesai, deskripsi, harga, status } = req.body;

    try {
        // Simpan langsung status dari frontend
        const maintenance = await Maintenance.create({
            bus_id,
            tanggal_perbaikan,
            tanggal_selesai: tanggal_selesai || null,
            deskripsi,
            status, // ⬅️ langsung dari frontend
            harga
        });

        // Update status bus sesuai maintenance
        if (status === 'sedang diperbaiki' || status === 'dijadwalkan') {
            await Bus.update({ status: 'dalam perbaikan' }, { where: { id_bus: bus_id } });
        } else if (status === 'selesai') {
            await Bus.update({ status: 'berhenti' }, { where: { id_bus: bus_id } });
        }

        res.status(201).json(maintenance);
    } catch (err) {
        console.error('❌ Gagal menambahkan maintenance:', err);
        res.status(500).json({ message: err.message });
    }
};

// 🔹 GET ALL
export const getAllMaintenance = async (req, res) => {
    try {
        const maintenances = await Maintenance.findAll({
            include: {
                model: Bus,
                as: 'bus',
                attributes: ['id_bus', 'plat_nomor', 'status']
            }
        });

        // Tidak perlu hitung ulang status — langsung kirim apa adanya
        res.json(maintenances);
    } catch (err) {
        console.error('❌ Gagal mengambil data maintenance:', err);
        res.status(500).json({ message: err.message });
    }
};

// 🔹 GET BY ID
export const getMaintenanceById = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id, {
            include: { model: Bus, as: 'bus' }
        });

        if (!maintenance) {
            return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });
        }

        res.json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// 🔹 UPDATE
export const updateMaintenance = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id);
        if (!maintenance) return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });

        const { tanggal_perbaikan, tanggal_selesai, deskripsi, harga, status } = req.body;

        await maintenance.update({
            tanggal_perbaikan,
            tanggal_selesai,
            deskripsi,
            status,
            harga
        });

        // Update status bus
        if (status === 'sedang diperbaiki' || status === 'dijadwalkan') {
            await Bus.update({ status: 'dalam perbaikan' }, { where: { id_bus: maintenance.bus_id } });
        } else if (status === 'selesai') {
            const sisaMaintenanceAktif = await Maintenance.count({
                where: {
                    bus_id: maintenance.bus_id,
                    id_maintenance: { [Op.ne]: maintenance.id_maintenance },
                    status: { [Op.in]: ['dijadwalkan', 'sedang diperbaiki'] }
                }
            });

            if (sisaMaintenanceAktif === 0) {
                await Bus.update({ status: 'berhenti' }, { where: { id_bus: maintenance.bus_id } });
            }
        }

        res.json(maintenance);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// 🔹 DELETE
export const deleteMaintenance = async (req, res) => {
    try {
        const maintenance = await Maintenance.findByPk(req.params.id);
        if (!maintenance) return res.status(404).json({ message: 'Catatan maintenance tidak ditemukan' });

        const bus_id = maintenance.bus_id;
        await maintenance.destroy();

        const sisaMaintenanceAktif = await Maintenance.count({
            where: {
                bus_id,
                status: { [Op.in]: ['dijadwalkan', 'sedang diperbaiki'] }
            }
        });

        if (sisaMaintenanceAktif === 0) {
            await Bus.update({ status: 'berhenti' }, { where: { id_bus: bus_id } });
        }

        res.json({ message: 'Catatan maintenance berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
