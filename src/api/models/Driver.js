import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Driver = sequelize.define('Driver', {
    id_driver: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    kode_driver: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true
        }
    },
    nama: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    tanggal_lahir: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
            isDate: true
        }
    },
    nomor_telepon: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
            isNumeric: true
        }
    },
    foto: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('berjalan', 'berhenti', 'dijadwalkan'),
        allowNull: false,
        defaultValue: 'berhenti',
    }
}, {
    tableName: 'driver',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['nama']
        },
        {
            fields: ['status']
        }
    ]
});

export default Driver;