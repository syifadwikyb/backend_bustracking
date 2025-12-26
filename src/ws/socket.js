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

// Kita hanya butuh satu fungsi ini sekarang
export function emitBusUpdate(data) {
    if (io) {
        // Data yang dikirim: { bus_id, lat, long, speed, passenger_count, eta, status }
        io.emit("bus_location", data);
    }
}