import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Halte = sequelize.define('Halte', {
    id_halte: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    nama_halte: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
    },
    jalur_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // Wajib diisi saat membuat halte
        references: {
            model: 'jalur', // Merujuk ke tabel 'jalur'
            key: 'id_jalur'
        }
    },
    urutan: {
        type: DataTypes.INTEGER,
        allowNull: false,
    }
}, {
    tableName: 'halte',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default Halte;