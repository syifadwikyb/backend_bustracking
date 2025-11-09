import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Bus = sequelize.define('Bus', {
    id_bus: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    plat_nomor: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    kode_bus: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    kapasitas: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    jenis_bus: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    foto: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('berhenti', 'dijadwalkan', 'berjalan', 'dalam perbaikan'),
        allowNull: false,
        defaultValue: 'berhenti',
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    penumpang: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    terakhir_dilihat: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'bus',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default Bus;
