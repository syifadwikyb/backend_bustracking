import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Schedule = sequelize.define('Schedule', {
    id_schedule: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    bus_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    driver_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    jalur_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    tanggal: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    jam_mulai: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    jam_selesai: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('dijadwalkan', 'berjalan', 'selesai'),
        allowNull: false,
        defaultValue: 'dijadwalkan'
    }
}, {
    tableName: 'schedules',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default Schedule;