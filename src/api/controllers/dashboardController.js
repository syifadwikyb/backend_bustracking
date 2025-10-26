// src/api/controllers/dashboardController.js
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import Jalur from '../models/Jalur.js';
import PassengerHistory from '../models/PassengerHistory.js';
import { Op, Sequelize } from 'sequelize';

// 1. Untuk Card Summary (Active, Non-Active, Maintenance)
export const getDashboardStats = async (req, res) => {
    try {
        const active = await Bus.count({ where: { status: 'aktif' } });
        const nonActive = await Bus.count({ where: { status: 'tidak aktif' } });
        const maintenance = await Bus.count({ where: { status: 'dalam perbaikan' } });

        res.json({ active, nonActive, maintenance });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// 2. Untuk Peta dan Daftar Bus (Data Live Awal)
export const getLiveBusData = async (req, res) => {
    try {
        const liveBuses = await Bus.findAll({
            attributes: [
                'id_bus', 'kode_bus', 'plat_nomor', 'jenis_bus', 'status', 
                'latitude', 'longitude', 'penumpang', 'kapasitas'
            ],
            // Ambil data driver dan rute yang sedang aktif hari ini dari tabel Schedule
            include: [
                {
                    model: Schedule,
                    as: 'jadwal',
                    where: { tanggal: new Date().toISOString().slice(0, 10) }, // Hanya jadwal hari ini
                    required: false,
                    include: [
                        { model: Driver, as: 'driver', attributes: ['nama'] },
                        { model: Jalur, as: 'jalur', attributes: ['nama_jalur'] }
                    ]
                }
            ]
        });
        res.json(liveBuses);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// 3. Untuk Chart Penumpang (Agregasi per hari selama 30 hari terakhir)
export const getPassengerChartData = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));

        const chartData = await PassengerHistory.findAll({
            attributes: [
                [Sequelize.fn('DATE', Sequelize.col('timestamp')), 'tanggal'],                            
                [Sequelize.fn('SUM', Sequelize.col('jumlah_penumpang')), 'total_penumpang']
            
            ],
            where: {
                timestamp: {
                    [Op.gte]: thirtyDaysAgo
                }
            },
            group: [Sequelize.fn('DATE', Sequelize.col('timestamp'))],
            order: [[Sequelize.fn('DATE', Sequelize.col('timestamp')), 'ASC']]
        });
        
        res.json(chartData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};