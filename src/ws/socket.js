import { Server } from "socket.io";

let io;

export default function initSocket(server) {
    io = new Server(server, {
        cors: { origin: "*" }
    });

    io.on("connection", (socket) => {
        console.log("🔌 Client connected:", socket.id);

        socket.on("disconnect", () => {
            console.log("❌ Client disconnected:", socket.id);
        });
    });
}

export function emitBusUpdate(data) {
    if (io) {
        io.emit("bus_location", data);
    }
}

export function emitPassengerUpdate(data) {
    if (io) {
        io.emit("passenger_update", data);
    }
}