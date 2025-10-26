// src/api/models/Maintenance.js
import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Maintenance = sequelize.define('Maintenance', {
    id_maintenance: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    bus_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    tanggal_perbaikan: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    deskripsi: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('sedang diperbaiki', 'selesai'),
        allowNull: false,
        defaultValue: 'sedang diperbaiki',
    },
    harga: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }
}, {
    tableName: 'maintenance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default Maintenance;
