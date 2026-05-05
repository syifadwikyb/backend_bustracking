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

    socket.on("join_bus_room", (busId, callback) => {
      const room = `bus_${busId}`;
      socket.join(room);
      console.log(`Socket ${socket.id} joined ${room}`);

      if (callback) callback({ status: "ok" });
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const emitBusLocation = (data) => {
  if (io) {
    console.log("📡 Emitting bus_location to room:", data.bus_id);
    // Emit ke room spesifik, bukan semua client
    io.to(`bus_${data.bus_id}`).emit("bus_location", data);
  } else {
    console.log("❌ io belum init!");
  }
};

export default initSocket;
