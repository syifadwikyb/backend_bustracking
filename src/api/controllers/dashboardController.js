// src/api/controllers/dashboardController.js
import Bus from '../models/Bus.js';
import Driver from '../models/Driver.js';
import Schedule from '../models/Schedule.js';
import Jalur from '../models/Jalur.js';
import Maintenance from '../models/Maintenance.js';
import PassengerHistory from '../models/PassengerHistory.js';
import { Op, Sequelize } from 'sequelize';

export const getDashboardStats = async (req, res) => {
    try {
        const active = await Bus.count({ where: { status: 'berjalan' } });
        const nonActive = await Bus.count({ where: { status: 'berhenti' } });
        const maintenance = await Maintenance.count({
            where: { status: { [Op.not]: 'selesai' } },
        });

        // Bus yang sedang berjalan = yang ada di jadwal hari ini dan status jadwal = 'berjalan'
        const running = await Schedule.count({
            where: {
                tanggal: new Date().toISOString().slice(0, 10),
                status: 'berjalan',
            },
        });

        res.json({ active, nonActive, maintenance, running });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// 2. Untuk Peta dan Daftar Bus (Data Live Awal)
export const getLiveBuses = async (req, res) => {
  try {
    const currentDate = new Date().toISOString().split("T")[0];
    const currentTime = new Date().toTimeString().split(" ")[0];

    // Ambil semua bus beserta relasinya
    const buses = await Bus.findAll({
      include: [
        {
          model: Schedule,
          as: "jadwal",
          where: { tanggal: currentDate },
          required: false,
          include: [
            {
              model: Driver,
              as: "driver",
              attributes: ["id_driver", "nama", "foto"],
            },
            {
              model: Jalur,
              as: "jalur",
              attributes: ["id_jalur", "nama_jalur", "rute_polyline"],
              include: [
                {
                  association: "halte",
                  attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
                },
              ],
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

    // Olah hasil untuk menyesuaikan status logis bus
    const liveBusData = await Promise.all(
      buses.map(async (bus) => {
        let currentStatus = "berhenti";

        if (bus.riwayat_perbaikan?.length > 0) {
          currentStatus = "dalam perbaikan";
        } else if (bus.jadwal?.length > 0) {
          const isActiveSchedule = bus.jadwal.some(
            (j) => j.jam_mulai <= currentTime && j.jam_selesai >= currentTime
          );
          if (isActiveSchedule) currentStatus = "berjalan";
        }

        // Update status di DB jika berubah
        if (bus.status !== currentStatus) {
          try {
            await bus.update({ status: currentStatus });
          } catch (err) {
            console.error("Gagal update status bus:", err.message);
          }
        }

        const data = bus.toJSON();
        data.status = currentStatus;
        return data;
      })
    );

    res.json(liveBusData);
  } catch (err) {
    console.error("Error di getLiveBuses:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// 3️⃣ Chart dummy: jumlah penumpang terbanyak per jam (hari ini)
export const getPassengerChartData = async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);

        const chartData = await PassengerHistory.findAll({
            attributes: [
                [Sequelize.fn('HOUR', Sequelize.col('timestamp')), 'jam'],
                [Sequelize.fn('SUM', Sequelize.col('jumlah_penumpang')), 'total_penumpang'],
            ],
            where: Sequelize.where(Sequelize.fn('DATE', Sequelize.col('timestamp')), today),
            group: [Sequelize.fn('HOUR', Sequelize.col('timestamp'))],
            order: [[Sequelize.fn('HOUR', Sequelize.col('timestamp')), 'ASC']],
        });

        // Jika tidak ada data, buat dummy
        const data = chartData.length
            ? chartData
            : [
                { jam: 7, total_penumpang: 50 },
                { jam: 9, total_penumpang: 120 },
                { jam: 12, total_penumpang: 200 },
                { jam: 15, total_penumpang: 180 },
                { jam: 17, total_penumpang: 100 },
            ];

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};