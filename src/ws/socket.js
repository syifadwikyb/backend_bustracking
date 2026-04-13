import { Server } from "socket.io";

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        },
        
        transports: ["websocket"],

        pingInterval: 25000,
        pingTimeout: 60000
    });

    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);

        socket.on("join_bus_room", (busId) => {
            socket.join(`bus_${busId}`);
        });

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

// Fungsi untuk kirim update ke Frontend
export const emitBusLocation = (data) => {
    if (io) {
        io.emit("bus_location", data);
    }
};

export default initSocket;