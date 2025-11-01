import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Driver = sequelize.define('Driver', {
    id_driver: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    kode_driver: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    nama: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    tanggal_lahir: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    nomor_telepon: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    foto: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        // --- PERBAIKAN ---
        type: DataTypes.ENUM('berjalan', 'berhenti', 'dijadwalkan'),
        defaultValue: 'berhenti',
    }
}, {
    tableName: 'drivers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});


export default Driver;