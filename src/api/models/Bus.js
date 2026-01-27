import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Bus = sequelize.define('Bus', {
    id_bus: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    plat_nomor: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true
        }
    },
    kode_bus: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true
        }
    },
    kapasitas: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    jenis_bus: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    foto: {
        type: DataTypes.STRING(255),
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
        defaultValue: 0,
        validate: {
            min: 0
        }
    },
    terakhir_dilihat: {
        type: DataTypes.DATE,
        allowNull: true
    },
    last_halte_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    next_halte_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    distance_to_next_halte: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    eta_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    }
}, {
    tableName: 'bus',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['status']
        },
        {
            fields: ['kode_bus']
        }
    ]
});

export default Bus;