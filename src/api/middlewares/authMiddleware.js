import jwt from "jsonwebtoken";
import Auth from "../models/Auth.js"; // Import model untuk verifikasi ganda

export const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Akses ditolak. Token tidak ditemukan." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userExists = await Auth.findByPk(decoded.id_admin);
        
        if (!userExists) {
            return res.status(401).json({ message: "Token tidak valid. User tidak ditemukan." });
        }

        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token kadaluarsa atau tidak valid." });
    }
};