// src/api/controllers/dashboardController.js
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import Schedule from "../models/Schedule.js";
import Jalur from "../models/Jalur.js";
import Maintenance from "../models/Maintenance.js";
// ✅ GANTI: Gunakan TrackingHistory, bukan PassengerHistory
import TrackingHistory from "../models/TrackingHistory.js";
import { Op, Sequelize } from "sequelize";

// --- 1. GET DASHBOARD DATA (Main Stats & Live Map) ---
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
          required: false, // Left Join
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
                  attributes: [
                    "id_halte",
                    "nama_halte",
                    "latitude",
                    "longitude",
                  ],
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

    // 2. Siapkan object statistik
    const stats = {
      running: 0,
      stopped: 0,
      maintenance: 0,
      scheduled: 0,
    };

    // 3. Proses Status Logic
    const liveBusData = buses.map((bus) => {
      let currentStatus = "berhenti";

      // Cek Maintenance (Prioritas Tertinggi)
      const isMaintenance = bus.riwayat_perbaikan?.length > 0;

      // Cek Jadwal
      let isRunningBySchedule = false;
      let isScheduledFuture = false;

      if (bus.jadwal?.length > 0) {
        // Cek apakah ada jadwal yang sedang aktif SEKARANG
        isRunningBySchedule = bus.jadwal.some(
          (j) => currentTime >= j.jam_mulai && currentTime <= j.jam_selesai,
        );
        // Cek apakah ada jadwal NANTI
        isScheduledFuture = bus.jadwal.some((j) => currentTime < j.jam_mulai);
      }

      // --- LOGIKA PENENTUAN STATUS ---
      if (isMaintenance) {
        currentStatus = "dalam perbaikan";
      } else if (isRunningBySchedule) {
        currentStatus = "berjalan";
      }
      // Jika jadwal lewat/belum, TAPI MQTT bilang 'berjalan', percayai MQTT
      else if (bus.status === "berjalan") {
        currentStatus = "berjalan";
      } else if (isScheduledFuture) {
        currentStatus = "dijadwalkan";
      } else {
        currentStatus = "berhenti";
      }

      // 4. Hitung Statistik
      if (currentStatus === "berjalan") stats.running++;
      else if (currentStatus === "berhenti") stats.stopped++;
      else if (currentStatus === "dalam perbaikan") stats.maintenance++;
      else if (currentStatus === "dijadwalkan") stats.scheduled++;

      // Return data bus + status kalkulasi
      const data = bus.toJSON();
      data.status = currentStatus;
      return data;
    });

    res.json({
      liveBuses: liveBusData,
      stats: stats,
    });
  } catch (err) {
    console.error("Error di getDashboardData:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// --- 2. GET PASSENGER CHART (Data Harian / Per Jam) ---
export const getPassengerChartData = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // ✅ GANTI SUMBER KE TrackingHistory
    const chartData = await TrackingHistory.findAll({
      attributes: [
        [Sequelize.fn("HOUR", Sequelize.col("created_at")), "jam"],
        // Kita gunakan MAX atau AVG karena passenger_count adalah snapshot total orang di bus
        // Bukan orang masuk (SUM). Jadi kita cari "Paling ramai jam berapa?"
        [
          Sequelize.fn("MAX", Sequelize.col("passenger_count")),
          "total_penumpang",
        ],
      ],
      // Filter hanya hari ini
      where: Sequelize.where(
        Sequelize.fn("DATE", Sequelize.col("created_at")),
        today,
      ),
      group: [Sequelize.fn("HOUR", Sequelize.col("created_at"))],
      order: [[Sequelize.fn("HOUR", Sequelize.col("created_at")), "ASC"]],
    });

    res.json(chartData);
  } catch (err) {
    console.error("Error Chart Data:", err);
    res.status(500).json({ message: err.message });
  }
};

// --- 3. GET BUS ACTIVITY (Data Range Tanggal untuk Grafik Garis) ---
export const getBusActivity = async (req, res) => {
  try {
    const { startDate, endDate, busId } = req.query;

    // Default: 7 hari terakhir
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 7));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // ✅ Query ke TrackingHistory
    const whereClause = {
      created_at: {
        [Op.between]: [start, end],
      },
    };

    if (busId) {
      whereClause.bus_id = busId;
    }

    const activityData = await TrackingHistory.findAll({
      attributes: [
        [Sequelize.fn("DATE", Sequelize.col("created_at")), "tanggal"],
        // Berapa penumpang terbanyak yang tercatat pada hari itu?
        [
          Sequelize.fn("MAX", Sequelize.col("passenger_count")),
          "max_penumpang",
        ],
        // Rata-rata penumpang hari itu
        [
          Sequelize.fn("AVG", Sequelize.col("passenger_count")),
          "avg_penumpang",
        ],
      ],
      where: whereClause,
      group: [Sequelize.fn("DATE", Sequelize.col("created_at"))],
      order: [[Sequelize.fn("DATE", Sequelize.col("created_at")), "ASC"]],
    });

    res.json(activityData);
  } catch (err) {
    console.error("Error getBusActivity:", err.message);
    res.status(500).json({ message: err.message });
  }
};

export const getBusUtilization = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default: 7 hari terakhir
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 7));
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    // 1. Ambil Data Aktivitas (Hitung jumlah log per bus_id)
    // Kita hitung berapa kali dia lapor "speed > 0" atau sekadar lapor lokasi (aktif)
    const utilizationData = await TrackingHistory.findAll({
      attributes: [
        "bus_id",
        [Sequelize.fn("COUNT", Sequelize.col("id_history")), "total_logs"],
      ],
      where: {
        created_at: { [Op.between]: [start, end] },
        // Opsional: Filter hanya jika bergerak (speed > 0)
        // speed: { [Op.gt]: 0 }
      },
      group: ["bus_id"],
      raw: true,
    });

    // 2. Ambil Semua Bus (Agar yang tidak beroperasi tetap muncul dengan nilai 0)
    const allBuses = await Bus.findAll({
      attributes: ["id_bus", "plat_nomor", "kode_bus"],
    });

    // 3. Gabungkan (Mapping)
    const result = allBuses.map((bus) => {
      // Cari data log untuk bus ini
      const found = utilizationData.find((u) => u.bus_id === bus.id_bus);

      // Asumsi: Hardware kirim data tiap 3 detik.
      // Maka: Total Logs * 3 detik = Total Detik Operasional
      // Kita konversi ke "Menit" agar angkanya enak dilihat
      const totalLogs = found ? parseInt(found.total_logs) : 0;
      const estimasiMenit = Math.round((totalLogs * 3) / 60);

      return {
        id_bus: bus.id_bus,
        plat_nomor: bus.plat_nomor,
        total_logs: totalLogs,
        active_minutes: estimasiMenit,
      };
    });

    // Urutkan dari yang paling sering dipakai (Highest usage first)
    result.sort((a, b) => b.active_minutes - a.active_minutes);

    res.json(result);
  } catch (err) {
    console.error("Error getBusUtilization:", err.message);
    res.status(500).json({ message: err.message });
  }
};
