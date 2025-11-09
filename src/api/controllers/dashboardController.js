// src/api/controllers/dashboardController.js
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import Jalur from '../models/Jalur.js';
import Maintenance from '../models/Maintenance.js';
import PassengerStat from '../models/PassengerStat.js'; // Mengganti PassengerStat
import { Op, Sequelize } from 'sequelize';

// FUNGSI INI SEKARANG MENGGABUNGKAN 'getLiveBuses' DAN 'getDashboardStats'
export const getDashboardData = async (req, res) => {
    try {
        const currentDate = new Date().toISOString().split("T")[0];
        const currentTime = new Date().toTimeString().split(" ")[0];

        // 1. Ambil SEMUA bus
        const buses = await Bus.findAll({
            include: [
                {
                    model: Schedule,
                    as: "jadwal",
                    where: { tanggal: currentDate },
                    required: false,
                    include: [
                        { model: Driver, as: "driver", attributes: ["id_driver", "nama", "foto"] },
                        {
                            model: Jalur,
                            as: "jalur",
                            attributes: ["id_jalur", "nama_jalur", "rute_polyline"],
                            include: [{
                                association: "halte",
                                attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
                            }],
                        },
                    ],
                },
                {
                    model: Maintenance,
                    as: "riwayat_perbaikan",
                    where: { status: { [Op.not]: "selesai" } },
                    required: false,
                },
            ],
        });

        // 2. Siapkan object untuk menghitung statistik
        const stats = {
            running: 0,
            stopped: 0,
            maintenance: 0,
            scheduled: 0
        };

        // 3. Hitung status di logika (Read-Only, Cepat)
        const liveBusData = buses.map((bus) => {
            let highestPriority = 0;
            let currentStatus = "berhenti"; 

            if (bus.riwayat_perbaikan?.length > 0) {
                highestPriority = 4;
            } 
            else if (bus.jadwal?.length > 0) {
                for (const j of bus.jadwal) {
                    let scheduleStatusPriority = 0;
                    if (j.jam_mulai <= currentTime && j.jam_selesai >= currentTime) {
                        scheduleStatusPriority = 3; // berjalan
                    } else if (j.jam_mulai > currentTime) {
                        scheduleStatusPriority = 2; // dijadwalkan
                    }
                    if (scheduleStatusPriority > highestPriority) {
                        highestPriority = scheduleStatusPriority;
                    }
                }
            }

            if (highestPriority === 4) currentStatus = 'dalam perbaikan';
            else if (highestPriority === 3) currentStatus = 'berjalan';
            else if (highestPriority === 2) currentStatus = 'dijadwalkan';

            // 4. Tambahkan ke hitungan statistik
            if (currentStatus === 'berjalan') stats.running++;
            else if (currentStatus === 'berhenti') stats.stopped++;
            else if (currentStatus === 'dalam perbaikan') stats.maintenance++;
            else if (currentStatus === 'dijadwalkan') stats.scheduled++;

            // --- Logika 'bus.update()' yang lambat DIHAPUS ---

            const data = bus.toJSON();
            data.status = currentStatus;
            return data;
        });

        // 5. Kirim kedua data (liveBuses dan stats) dalam satu respons
        res.json({
            liveBuses: liveBusData,
            stats: stats
        });

    } catch (err) {
        console.error("Error di getDashboardData:", err.message);
        res.status(500).json({ message: err.message });
    }
};

// 3️⃣ Fungsi untuk Chart Penumpang (Tidak berubah)
export const getPassengerChartData = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const chartData = await PassengerStat.findAll({ // Perbaiki typo PassengerStat
            attributes: [
                [Sequelize.fn('HOUR', Sequelize.col('timestamp')), 'jam'],
                [Sequelize.fn('SUM', Sequelize.col('jumlah_penumpang')), 'total_penumpang'],
            ],
            where: Sequelize.where(Sequelize.fn('DATE', Sequelize.col('timestamp')), today),
            group: [Sequelize.fn('HOUR', Sequelize.col('timestamp'))],
            order: [[Sequelize.fn('HOUR', Sequelize.col('timestamp')), 'ASC']],
        });

        const data = chartData.length ? chartData : [
            { jam: 7, total_penumpang: 50 }, { jam: 9, total_penumpang: 120 },
            { jam: 12, total_penumpang: 200 }, { jam: 15, total_penumpang: 180 },
            { jam: 17, total_penumpang: 100 },
        ];
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};