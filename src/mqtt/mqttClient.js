import mqtt from "mqtt";
import fetch from "node-fetch";
import { emitBusLocation } from "../ws/socket.js";
import Bus from "../api/models/Bus.js";
import Schedule from "../api/models/Schedule.js";
import Jalur from "../api/models/Jalur.js";
import Halte from "../api/models/Halte.js";
import { getEtaFromML } from "../api/controllers/EtaController.js";
import dotenv from "dotenv";

dotenv.config();

const CACHE_DURATION = 10 * 60 * 1000;
console.log("API_URL:", process.env.API_URL);

let cachedHalte = [];
const busSpeedBuffer = {};
const busTargetTracker = {};

const updateHalteCache = async () => {
  try {
    const haltes = await Halte.findAll({
      attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
      raw: true,
    });
    cachedHalte = haltes;
  } catch (err) {
    console.error("Gagal cache halte:", err.message);
  }
};

updateHalteCache();
setInterval(updateHalteCache, CACHE_DURATION);

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function calculateRollingSpeed(busId, currentSpeed) {
  if (!busSpeedBuffer[busId]) busSpeedBuffer[busId] = [];
  busSpeedBuffer[busId].push(currentSpeed);
  if (busSpeedBuffer[busId].length > 3) busSpeedBuffer[busId].shift();
  const sum = busSpeedBuffer[busId].reduce((a, b) => a + b, 0);
  return parseFloat((sum / busSpeedBuffer[busId].length).toFixed(2));
}

// ─── FUNGSI BACKGROUND: hitung ETA + update DB ───────────────────────────────
async function processEtaAndUpdate(bus_id, payload, allHaltes, targetIndex, rollingSpeed) {
  const now = new Date();

  // hitung jarak ke semua halte
  let cumulativeDistance = 0;
  const routeData = {};

  for (let step = 0; step < allHaltes.length; step++) {
    let idx = (targetIndex + step) % allHaltes.length;
    let halte = allHaltes[idx];

    if (step === 0) {
      cumulativeDistance = getDistanceMeters(
        payload.latitude, payload.longitude,
        parseFloat(halte.latitude), parseFloat(halte.longitude),
      );
    } else {
      let prev = allHaltes[(idx - 1 + allHaltes.length) % allHaltes.length];
      cumulativeDistance += getDistanceMeters(
        parseFloat(prev.latitude), parseFloat(prev.longitude),
        parseFloat(halte.latitude), parseFloat(halte.longitude),
      );
    }

    routeData[halte.id_halte] = { distance: cumulativeDistance, step };
  }

  // panggil ML untuk semua halte (di background)
  const hasilSemuaEta = await Promise.all(
    allHaltes.map(async (h, i) => {
      const r = routeData[h.id_halte];
      const eta = await getEtaFromML({
        remaining_halte_count: allHaltes.length - r.step,
        distance_to_target: r.distance,
        rolling_speed_30s: rollingSpeed,
        hour_of_day: now.getHours(),
        day_of_week: now.getDay(),
      });
      return {
        halte_id: h.id_halte,
        nama_halte: h.nama_halte,
        distance_meters: r.distance,
        eta_seconds: eta,
        is_target: i === targetIndex,
      };
    }),
  );

  const targetStop = hasilSemuaEta.find((h) => h.is_target);

  // update DB
  await Bus.update(
    {
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      penumpang: payload.passenger_count || 0,
      terakhir_dilihat: now,
      next_halte_id: targetStop?.halte_id || null,
      eta_seconds: targetStop?.eta_seconds || null,
      status: payload.speed > 1 ? "berjalan" : "berhenti",
    },
    { where: { id_bus: bus_id } },
  );

  // emit ke frontend dengan data ETA lengkap
  emitBusLocation({
    bus_id,
    latitude: payload.latitude,
    longitude: payload.longitude,
    speed: payload.speed || 0,
    penumpang: payload.passenger_count || 0,
    next_halte_id: targetStop?.halte_id || null,
    nama_halte_tujuan: targetStop?.nama_halte || null,
    distance: targetStop?.distance_meters || 0,
    eta_seconds: targetStop?.eta_seconds || null,
    daftar_eta: hasilSemuaEta,
    updated_at: now,
  });
}

// ─── MQTT ─────────────────────────────────────────────────────────────────────
const client = mqtt.connect(process.env.MQTT_BROKER_URL);

client.on("connect", () => {
  client.subscribe("diptrack/tracking/bus/#");
});

client.on("error", (err) => {
  console.error("MQTT Error:", err.message);
});

client.on("reconnect", () => {
  console.log("Reconnect MQTT...");
});

client.on("message", async (topic, message) => {
  const topicParts = topic.split("/");
  if (topicParts.length < 5 || topicParts[4] !== "location") return;

  const bus_id = parseInt(topicParts[3]);
  if (isNaN(bus_id)) return;

  try {
    const payload = JSON.parse(message.toString());
    if (!payload.latitude || !payload.longitude) return;

    // ambil data bus + relasi
    const currentBus = await Bus.findByPk(bus_id, {
      include: [
        {
          model: Schedule,
          as: "jadwal",
          include: [
            {
              model: Jalur,
              as: "jalur",
              include: [{ model: Halte, as: "halte" }],
            },
          ],
        },
      ],
    });

    if (!currentBus) return;

    const jadwalList = Array.isArray(currentBus.jadwal)
      ? currentBus.jadwal
      : currentBus.jadwal ? [currentBus.jadwal] : [];

    const activeSchedule = jadwalList.find(
      (j) => j.status?.toLowerCase().trim() === "berjalan",
    );

    if (!activeSchedule?.jalur?.halte?.length) return;

    const allHaltes = [...activeSchedule.jalur.halte].reverse();

    // tentukan halte target
    let targetIndex = busTargetTracker[bus_id] || 0;
    let targetHalte = allHaltes[targetIndex];

    const minDistance = getDistanceMeters(
      payload.latitude, payload.longitude,
      parseFloat(targetHalte.latitude), parseFloat(targetHalte.longitude),
    );

    if (minDistance < 70) {
      targetIndex = (targetIndex + 1) % allHaltes.length;
    }

    busTargetTracker[bus_id] = targetIndex;

    const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);

    // ✅ EMIT LOKASI LANGSUNG — tidak tunggu ML
    emitBusLocation({
      bus_id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed || 0,
      penumpang: payload.passenger_count || 0,
      updated_at: new Date(),
    });

    // ✅ PROSES ETA + DB DI BACKGROUND — tidak blocking
    processEtaAndUpdate(bus_id, payload, allHaltes, targetIndex, rollingSpeed)
      .catch((err) => console.error("Background ETA error:", err.message));

    // kirim ke REST API (tetap async, tidak blocking)
    fetch(`${process.env.API_URL}/api/rest/bus-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bus_id,
        latitude: payload.latitude,
        longitude: payload.longitude,
        speed: payload.speed || 0,
        passenger_count: payload.passenger_count || 0,
      }),
    })
      .then((res) => res.json())
      .then((resJson) => console.log("✅ Respons dari REST API:", resJson))
      .catch((err) => console.error("❌ Gagal kirim ke REST API:", err.message));

  } catch (err) {
    console.error("Error MQTT:", err);
  }
});

export default client;

// import mqtt from "mqtt";
// import fetch from "node-fetch";
// import { emitBusLocation } from "../ws/socket.js";
// import Bus from "../api/models/Bus.js";
// import Schedule from "../api/models/Schedule.js";
// import Jalur from "../api/models/Jalur.js";
// import Halte from "../api/models/Halte.js";
// import { getEtaFromML } from "../api/controllers/EtaController.js";
// import dotenv from "dotenv";

// dotenv.config();

// const CACHE_DURATION = 10 * 60 * 1000;

// let cachedHalte = [];
// const busSpeedBuffer = {};
// const busTargetTracker = {};

// const updateHalteCache = async () => {
//   try {
//     const haltes = await Halte.findAll({
//       attributes: ["id_halte", "nama_halte", "latitude", "longitude"],
//       raw: true,
//     });

//     cachedHalte = haltes;
//   } catch (err) {
//     console.error("Gagal cache halte:", err.message);
//   }
// };

// updateHalteCache();

// setInterval(updateHalteCache, CACHE_DURATION);

// function getDistanceMeters(lat1, lon1, lat2, lon2) {
//   const R = 6371000;

//   const dLat = (lat2 - lat1) * (Math.PI / 180);

//   const dLon = (lon2 - lon1) * (Math.PI / 180);

//   const a =
//     Math.sin(dLat / 2) ** 2 +
//     Math.cos(lat1 * (Math.PI / 180)) *
//       Math.cos(lat2 * (Math.PI / 180)) *
//       Math.sin(dLon / 2) ** 2;

//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

//   return Math.round(R * c);
// }

// function calculateRollingSpeed(busId, currentSpeed) {
//   if (!busSpeedBuffer[busId]) {
//     busSpeedBuffer[busId] = [];
//   }

//   busSpeedBuffer[busId].push(currentSpeed);

//   if (busSpeedBuffer[busId].length > 3) {
//     busSpeedBuffer[busId].shift();
//   }

//   const sum = busSpeedBuffer[busId].reduce((a, b) => a + b, 0);

//   return parseFloat((sum / busSpeedBuffer[busId].length).toFixed(2));
// }

// // =====================================================
// // PROCESS ETA + UPDATE DB + EMIT SOCKET
// // =====================================================
// async function processEtaAndUpdate(
//   bus_id,
//   payload,
//   allHaltes,
//   targetIndex,
//   rollingSpeed,
// ) {
//   const now = new Date();

//   let cumulativeDistance = 0;

//   const routeData = {};

//   for (let step = 0; step < allHaltes.length; step++) {
//     const idx = (targetIndex + step) % allHaltes.length;

//     const halte = allHaltes[idx];

//     if (step === 0) {
//       cumulativeDistance = getDistanceMeters(
//         payload.latitude,
//         payload.longitude,
//         parseFloat(halte.latitude),
//         parseFloat(halte.longitude),
//       );
//     } else {
//       const prev = allHaltes[(idx - 1 + allHaltes.length) % allHaltes.length];

//       cumulativeDistance += getDistanceMeters(
//         parseFloat(prev.latitude),
//         parseFloat(prev.longitude),
//         parseFloat(halte.latitude),
//         parseFloat(halte.longitude),
//       );
//     }

//     routeData[halte.id_halte] = {
//       distance: cumulativeDistance,
//       step,
//     };
//   }

//   // =========================
//   // ETA ML
//   // =========================
//   const hasilSemuaEta = await Promise.all(
//     allHaltes.map(async (h, i) => {
//       const r = routeData[h.id_halte];

//       const eta = await getEtaFromML({
//         remaining_halte_count: allHaltes.length - r.step,

//         distance_to_target: r.distance,

//         rolling_speed_30s: rollingSpeed,

//         hour_of_day: now.getHours(),

//         day_of_week: now.getDay(),
//       });

//       return {
//         halte_id: h.id_halte,
//         nama_halte: h.nama_halte,
//         distance_meters: r.distance,
//         eta_seconds: eta,
//         is_target: i === targetIndex,
//       };
//     }),
//   );

//   const targetStop = hasilSemuaEta.find((h) => h.is_target);

//   // =========================
//   // UPDATE DB
//   // =========================
//   await Bus.update(
//     {
//       latitude: payload.latitude,
//       longitude: payload.longitude,
//       speed: payload.speed || 0,
//       penumpang: payload.passenger_count || 0,
//       terakhir_dilihat: now,
//       next_halte_id: targetStop?.halte_id || null,
//       eta_seconds: targetStop?.eta_seconds || null,
//       status: payload.speed > 1 ? "berjalan" : "berhenti",
//     },
//     {
//       where: {
//         id_bus: bus_id,
//       },
//     },
//   );

//   // =========================
//   // SINGLE EMIT SOCKET
//   // =========================
//   emitBusLocation({
//     bus_id,

//     latitude: payload.latitude,

//     longitude: payload.longitude,

//     speed: payload.speed || 0,

//     penumpang: payload.passenger_count || 0,

//     next_halte_id: targetStop?.halte_id || null,

//     nama_halte_tujuan: targetStop?.nama_halte || null,

//     distance: targetStop?.distance_meters || 0,

//     eta_seconds: targetStop?.eta_seconds || null,

//     daftar_eta: hasilSemuaEta,

//     updated_at: now,
//   });
// }

// // =====================================================
// // MQTT
// // =====================================================
// const client = mqtt.connect(process.env.MQTT_BROKER_URL);

// client.on("connect", () => {
//   client.subscribe("diptrack/tracking/bus/#");
// });

// client.on("error", (err) => {
//   console.error("MQTT Error:", err.message);
// });

// client.on("reconnect", () => {
//   console.log("Reconnect MQTT...");
// });

// client.on("message", async (topic, message) => {
//   const topicParts = topic.split("/");

//   if (topicParts.length < 5 || topicParts[4] !== "location") {
//     return;
//   }

//   const bus_id = parseInt(topicParts[3]);

//   if (isNaN(bus_id)) return;

//   try {
//     const payload = JSON.parse(message.toString());

//     if (!payload.latitude || !payload.longitude) {
//       return;
//     }

//     // =========================
//     // AMBIL DATA BUS
//     // =========================
//     const currentBus = await Bus.findByPk(bus_id, {
//       include: [
//         {
//           model: Schedule,
//           as: "jadwal",

//           include: [
//             {
//               model: Jalur,
//               as: "jalur",

//               include: [
//                 {
//                   model: Halte,
//                   as: "halte",
//                 },
//               ],
//             },
//           ],
//         },
//       ],
//     });

//     if (!currentBus) return;

//     const jadwalList = Array.isArray(currentBus.jadwal)
//       ? currentBus.jadwal
//       : currentBus.jadwal
//         ? [currentBus.jadwal]
//         : [];

//     const activeSchedule = jadwalList.find(
//       (j) => j.status?.toLowerCase().trim() === "berjalan",
//     );

//     if (!activeSchedule?.jalur?.halte?.length) {
//       return;
//     }

//     const allHaltes = [...activeSchedule.jalur.halte].reverse();

//     // =========================
//     // TARGET HALTE
//     // =========================
//     let targetIndex = busTargetTracker[bus_id] || 0;

//     let targetHalte = allHaltes[targetIndex];

//     const minDistance = getDistanceMeters(
//       payload.latitude,
//       payload.longitude,
//       parseFloat(targetHalte.latitude),
//       parseFloat(targetHalte.longitude),
//     );

//     if (minDistance < 70) {
//       targetIndex = (targetIndex + 1) % allHaltes.length;
//     }

//     busTargetTracker[bus_id] = targetIndex;

//     const rollingSpeed = calculateRollingSpeed(bus_id, payload.speed || 0);

//     // =========================
//     // PROCESS ETA
//     // =========================
//     processEtaAndUpdate(
//       bus_id,
//       payload,
//       allHaltes,
//       targetIndex,
//       rollingSpeed,
//     ).catch((err) => console.error("Background ETA error:", err.message));

//     // =========================
//     // REST API ASYNC
//     // =========================
//     fetch(`${process.env.API_URL}/api/rest/bus-location`, {
//       method: "POST",

//       headers: {
//         "Content-Type": "application/json",
//       },

//       body: JSON.stringify({
//         bus_id,

//         latitude: payload.latitude,

//         longitude: payload.longitude,

//         speed: payload.speed || 0,

//         passenger_count: payload.passenger_count || 0,
//       }),
//     })
//       .then((res) => res.json())
//       .then((resJson) => console.log("✅ Respons REST:", resJson))
//       .catch((err) => console.error("❌ REST Error:", err.message));
//   } catch (err) {
//     console.error("MQTT Error:", err);
//   }
// });

// export default client;