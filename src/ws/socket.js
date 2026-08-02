import { Server } from "socket.io";

let io;

// Menginisialisasi server Socket.IO
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
    pingInterval: 25000,
    pingTimeout: 60000,
    connectTimeout: 45000,
  });

  // Menangani koneksi klien
  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on("join_bus_room", (busId) => {
      socket.join(`bus_${busId}`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

// Mengirim data lokasi bus
export const emitBusLocation = (data) => {
  // Mengambil waktu server saat ini
  const now = Date.now();
  console.log("🟢 SERVER NOW:", now);
  io.emit("bus_location", {
    ...data,
    server_time: now,
  });
};

export default initSocket;
