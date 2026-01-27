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
        validate: {
            isDate: true
        }
    },
    tanggal_selesai: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        validate: {
            isDate: true
        }
    },
    deskripsi: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('dijadwalkan', 'sedang diperbaiki', 'selesai'),
        allowNull: false,
        defaultValue: 'dijadwalkan',
    },
    harga: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
            min: 0
        }
    }
}, {
    tableName: 'maintenance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['bus_id']
        },
        {
            fields: ['status']
        }
    ]
});

export default Maintenance;