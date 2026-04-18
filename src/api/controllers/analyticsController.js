import dayjs from "dayjs";
import Schedule from "../models/Schedule.js";
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import { Op } from "sequelize";

// ===============================
// 📊 GET ANALYTICS
// ===============================
export const getAnalytics = async (req, res) => {
  try {
    const { type } = req.query;

    const now = dayjs();

    let start_date, end_date;

    // 🔥 FILTER LOGIC
    switch (type) {
      case "7days":
        start_date = now.subtract(7, "day").format("YYYY-MM-DD");
        break;

      case "1month":
        start_date = now.subtract(1, "month").format("YYYY-MM-DD");
        break;

      case "3months":
        start_date = now.subtract(3, "month").format("YYYY-MM-DD");
        break;

      case "1year":
        start_date = now.subtract(1, "year").format("YYYY-MM-DD");
        break;

      default:
        start_date = now.format("YYYY-MM-DD");
    }

    end_date = now.format("YYYY-MM-DD");

    const schedules = await Schedule.findAll({
      where: {
        tanggal: {
          [Op.between]: [start_date, end_date],
        },
      },
      include: [
        {
          model: Bus,
          as: "bus",
          attributes: ["id_bus", "kode_bus", "foto"],
        },
        {
          model: Driver,
          as: "driver",
          attributes: ["id_driver", "nama", "driver_foto"],
        },
      ],
    });

    const busMap = {};
    const driverMap = {};

    schedules.forEach((s) => {
      const start = new Date(`1970-01-01 ${s.jam_mulai}`);
      const end = new Date(`1970-01-01 ${s.jam_selesai}`);

      const duration = (end - start) / (1000 * 60 * 60);

      // BUS
      if (!busMap[s.bus_id]) {
        busMap[s.bus_id] = {
          id_bus: s.bus.id_bus,
          name: s.bus.kode_bus,
          foto: s.bus.foto,
          total_jam: 0,
        };
      }
      busMap[s.bus_id].total_jam += duration;

      // DRIVER
      if (!driverMap[s.driver_id]) {
        driverMap[s.driver_id] = {
          id_driver: s.driver.id_driver,
          name: s.driver.nama,
          driver_foto: s.driver.driver_foto,
          total_jam: 0,
        };
      }
      driverMap[s.driver_id].total_jam += duration;
    });

    res.json({
      bus: Object.values(busMap),
      driver: Object.values(driverMap),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
