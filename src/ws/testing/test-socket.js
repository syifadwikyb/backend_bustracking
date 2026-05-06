// src/ws/testing/test-socket.js
import { io } from "socket.io-client";

const socket = io("http://145.79.15.182:5000", {
  transports: ["websocket", "polling"]
});

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);
  socket.emit("join_bus_room", 1);
  console.log("📤 Emit join_bus_room bus_id: 1");
});

socket.on("bus_location_update", (data) => {
  console.log("📍 Terima!", data.bus_id, data.latitude);
});

socket.on("connect_error", (err) => {
  console.log("❌ Error:", err.message);
});

setTimeout(() => {
  socket.disconnect();
  process.exit(0);
}, 30000);