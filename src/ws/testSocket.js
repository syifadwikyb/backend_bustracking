import { io } from "socket.io-client";

const socket = io("ws://localhost:5000", {
    transports: ["websocket"]
});

socket.on("connect", () => {
    console.log("✅ Connected ke server:", socket.id);
});

socket.on("connect_error", (err) => {
    console.error("❌ Gagal connect:", err.message);
});

socket.on("bus_location", (data) => {
    console.log("📍 Update lokasi bus:", data);
});
