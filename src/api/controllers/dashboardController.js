import Bus from "../models/Bus.js";
import Schedule from "../models/Schedule.js";
import Maintenance from "../models/Maintenance.js";
import TrackingHistory from "../models/TrackingHistory.js";
import { Op, Sequelize } from "sequelize";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

// --- GET DASHBOARD DATA ---
export const getDashboardData = async (req, res) => {
    try {
        const now = dayjs().tz("Asia/Jakarta");
        const today = now.format("YYYY-MM-DD");
        const timeNow = now.format("HH:mm:ss");

        const buses = await Bus.findAll({
            include: [
                {
                    model: Schedule,
                    as: "jadwal",
                    where: { tanggal: today },
                    required: false, 
                },
                {
                    model: Maintenance,
                    as: "riwayat_perbaikan",
                    where: { status: { [Op.ne]: "selesai" } },
                    required: false,
                },
            ],
        });

        const stats = { running: 0, stopped: 0, maintenance: 0, scheduled: 0 };

        const liveBuses = buses.map((busInstance) => {
            const bus = busInstance.toJSON();
            let currentStatus = "berhenti";

            const isMaintenance = bus.riwayat_perbaikan?.length > 0;
            let hasActiveSchedule = false;
            let hasFutureSchedule = false;

            if (bus.jadwal?.length > 0) {
                hasActiveSchedule = bus.jadwal.some(j => timeNow >= j.jam_mulai && timeNow <= j.jam_selesai);
                hasFutureSchedule = bus.jadwal.some(j => timeNow < j.jam_mulai);
            }

            if (isMaintenance) currentStatus = 'dalam perbaikan';
            else if (hasActiveSchedule) currentStatus = 'berjalan';
            else if (hasFutureSchedule) currentStatus = 'dijadwalkan';
            
            // Increment Stats
            if (currentStatus === 'berjalan') stats.running++;
            else if (currentStatus === 'berhenti') stats.stopped++;
            else if (currentStatus === 'dalam perbaikan') stats.maintenance++;
            else if (currentStatus === 'dijadwalkan') stats.scheduled++;

            bus.status = currentStatus;
            return bus;
        });

        res.json({ liveBuses, stats });

    } catch (err) {
        console.error("Error getDashboardData:", err);
        res.status(500).json({ message: "Gagal memuat dashboard" });
    }
};

// --- GET BUS ACTIVITY ---
export const getBusActivity = async (req, res) => {
  try {
    const { startDate, endDate, busId } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 7));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const whereClause = {
      created_at: { [Op.between]: [start, end] },
    };

    if (busId) whereClause.bus_id = busId;

    const activityData = await TrackingHistory.findAll({
      attributes: [
        [Sequelize.fn("DATE", Sequelize.col("created_at")), "tanggal"],
        [Sequelize.fn("MAX", Sequelize.col("passenger_count")), "max_penumpang"],
        [Sequelize.fn("AVG", Sequelize.col("passenger_count")), "avg_penumpang"],
      ],
      where: whereClause,
      group: [Sequelize.fn("DATE", Sequelize.col("created_at"))],
      order: [[Sequelize.fn("DATE", Sequelize.col("created_at")), "ASC"]],
      raw: true
    });

    const formatted = activityData.map(d => ({
        ...d,
        avg_penumpang: parseFloat(d.avg_penumpang).toFixed(1)
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- UTILIZATION ---
export const getBusUtilization = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 7));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const utilizationData = await TrackingHistory.findAll({
      attributes: [
        "bus_id",
        [Sequelize.fn("COUNT", Sequelize.col("id_history")), "total_logs"],
      ],
      where: {
        created_at: { [Op.between]: [start, end] },
      },
      group: ["bus_id"],
      raw: true,
    });

    const allBuses = await Bus.findAll({
      attributes: ["id_bus", "plat_nomor", "kode_bus"],
      raw: true
    });

    const result = allBuses.map((bus) => {
      const found = utilizationData.find((u) => u.bus_id === bus.id_bus);
      const totalLogs = found ? parseInt(found.total_logs) : 0;
      
      const estimasiMenit = Math.round((totalLogs * 10) / 60);

      return {
        id_bus: bus.id_bus,
        plat_nomor: bus.plat_nomor,
        total_logs: totalLogs,
        active_minutes: estimasiMenit,
      };
    });

    result.sort((a, b) => b.active_minutes - a.active_minutes);

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};