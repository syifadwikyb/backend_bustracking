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
        validate: {
            isDate: true
        }
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
    tableName: 'schedule',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['tanggal']
        },
        {
            fields: ['bus_id']
        },
        {
            fields: ['driver_id']
        }
    ]
});

export default Schedule;