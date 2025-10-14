import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Jalur = sequelize.define('Jalur', {
    id_jalur: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    nama_jalur: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    kode_jalur: {
        type: DataTypes.STRING,
        unique: true,
    },
    status: {
        type: DataTypes.ENUM('aktif', 'tidak aktif'),
        allowNull: false,
        defaultValue: 'aktif'
    },
    rute_polyline: {
        type: DataTypes.TEXT('long'),
        allowNull: false,
    }
}, {
    tableName: 'jalur',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default Jalur;
