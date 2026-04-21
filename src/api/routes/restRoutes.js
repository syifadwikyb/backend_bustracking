import express from "express";
const router = express.Router();

// Gunakan Object atau Map agar mudah di-update berdasarkan ID
let latestBusLocations = {}; 

// POST: Menerima data dari MQTT Client
router.post("/", (req, res) => {
  const { bus_id, latitude, longitude, speed } = req.body;

  if (!bus_id) {
    return res.status(400).json({ error: "bus_id wajib diisi" });
  }

  // Timpa data lama dengan yang baru (Upsert logic)
  latestBusLocations[bus_id] = {
    bus_id,
    latitude,
    longitude,
    speed,
    server_time: new Date()
  };

  res.json({ success: true, message: "Data updated" });
});

// GET: Dipanggil oleh Frontend (Next.js)
router.get("/", (req, res) => {
  // Mengubah object menjadi array agar mudah di-map di frontend
  const dataArray = Object.values(latestBusLocations);
  res.json({
    total: dataArray.length,
    data: dataArray
  });
});

export default router;