// src/api/models/Maintenance.js

import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Maintenance = sequelize.define('Maintenance', {
    id_maintenance: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    kode_bus: {
        type: DataTypes.STRING,
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
        type: DataTypes.ENUM('dijadwalkan', 'sedang diperbaiki', 'selesai', 'dibatalkan'),
        allowNull: false,
        defaultValue: 'dijadwalkan',
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