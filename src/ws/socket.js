import { Server } from "socket.io";

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  // io.on("connection", (socket) => {
  //   console.log(`Client connected: ${socket.id}`);

  //   socket.on("join_bus_room", (busId) => {
  //     socket.join(`bus_${busId}`);
  //   });

  //   socket.on("bus_location", (data) => {
  //     socket.emit("bus_location_response", {
  //       ...data,
  //       server_time: Date.now(),
  //     });
  //   });

  //   socket.on("bus_location_test", (data) => {
  //     socket.emit("bus_location_response", {
  //       status: "ok",
  //       server_time: Date.now(),
  //     });
  //   });

  //   socket.on("disconnect", () => {
  //     console.log(`❌ Client disconnected: ${socket.id}`);
  //   });
  // });

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // ⬇️ kirim data langsung saat connect
    socket.emit("bus_location", {
      bus_id: 1,
      latitude: -7.05,
      longitude: 110.43,
      speed: 30,
      penumpang: 1,
      updated_at: new Date(),
    });

    socket.on("join_bus_room", (busId, callback) => {
      socket.join(`bus_${busId}`);

      if (callback) {
        callback({ status: "ok" });
      }
      
      socket.on("disconnect", () => clearInterval(interval));
    });
  });

  return io;
};

export const emitBusLocation = (data) => {
  if (io) {
    console.log("📡 Emitting bus_location:", data.bus_id); // ← tambah ini
    io.emit("bus_location", data);
  } else {
    console.log("❌ io belum init!"); // ← dan ini
  }
};

export default initSocket;
