import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Auth from "../models/Auth.js";

// --- REGISTER ---
export const register = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Username dan password wajib diisi" });
        }

        const existingUserCount = await Auth.count({ where: { username } });
        if (existingUserCount > 0) {
            return res.status(400).json({ message: "Username sudah digunakan" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await Auth.create({ username, password: hashedPassword });

        res.status(201).json({ message: "Registrasi berhasil" });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: "Terjadi kesalahan server" });
    }
};

// --- LOGIN ---
export const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Auth.findOne({ where: { username } });
        const invalidMsg = "Username atau Password salah";

        if (!user) return res.status(400).json({ message: invalidMsg });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: invalidMsg });

        const token = jwt.sign(
            { id_admin: user.id_admin, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            message: "Login berhasil",
            token,
            user: { id_admin: user.id_admin, username: user.username },
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "Terjadi kesalahan server" });
    }
};

// --- CHANGE PASSWORD ---
export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Isi password lama dan baru" });
        }

        const user = await Auth.findByPk(req.user.id_admin);
        if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "Password lama salah" });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: "Password berhasil diubah" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};