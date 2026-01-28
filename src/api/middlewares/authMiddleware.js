import jwt from "jsonwebtoken";
import Auth from "../models/Auth.js"; // Import model untuk verifikasi ganda

export const authMiddleware = (req, res, next) => {
    // ⚠️ [MODE TESTING PERFORMA]
    // Bypass total: Anggap user sudah login sebagai admin ID 1
    req.user = { 
        id_admin: 1, 
        username: "TesterAdmin" 
    };
    return next(); // Langsung lanjut tanpa cek token

    /* --- KODE ASLI DIMATIKAN SEMENTARA ---
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Token tidak ditemukan" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token tidak valid" });
    }
    ---------------------------------------- */
};