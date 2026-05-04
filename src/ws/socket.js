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

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on("join_bus_room", (busId) => {
      socket.join(`bus_${busId}`);
    });

    socket.on("bus_location", (data) => {
      socket.emit("bus_location_response", {
        ...data,
        server_time: Date.now(),
      });
    });

    socket.on("bus_location_test", (data, callback) => {
      console.log("📥 EVENT MASUK:", data);
      console.log("📥 CALLBACK:", callback);

      if (typeof callback === "function") {
        callback({
          status: "ok",
          server_time: Date.now(),
        });
      } else {
        console.log("❌ CALLBACK TIDAK ADA");
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
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
