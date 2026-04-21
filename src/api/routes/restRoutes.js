import express from "express";

const router = express.Router();

// mock database
let busLocations = [];

// POST
router.post("/bus-location", (req, res) => {
  console.log("BODY:", req.body);

  const { bus_id, latitude, longitude, speed } = req.body;

  if (!bus_id) {
    return res.status(400).json({ error: "bus_id tidak ada" });
  }

  const data = {
    bus_id,
    latitude,
    longitude,
    speed,
    server_time: Date.now()
  };

  busLocations.push(data); // 🔥 WAJIB supaya GET ada isi

  console.log(`[REST-HTTP] Data Masuk Bus ${bus_id} | Speed: ${speed} km/h`);

  res.json({
    success: true,
    data
  });
});

// GET
router.get("/bus-location", (req, res) => {
  console.log("GET DIPANGGIL");

  res.json({
    total: busLocations.length,
    data: busLocations
  });
});

export default router;