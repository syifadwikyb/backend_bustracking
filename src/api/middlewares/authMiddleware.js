import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Token tidak ditemukan" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // simpan data user
        next();
    } catch (err) {
        return res.status(403).json({ message: "Token tidak valid" });
    }
};
