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
      socket.join(`bus_${busId}`);
      if (callback) callback({ status: "ok" });
    });

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const emitBusLocation = (data) => {
  io.to(`bus_${data.bus_id}`).emit("bus_location", data);
};

export default initSocket;
