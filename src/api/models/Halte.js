import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const Halte = sequelize.define('Halte', {
    id_halte: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    nama_halte: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false,
        validate: {
            isDecimal: true
        }
    },
    longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false,
        validate: {
            isDecimal: true
        }
    },
    jalur_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'jalur',
            key: 'id_jalur'
        }
    },
    urutan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1 
        }
    }
}, {
    tableName: 'halte',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['jalur_id']
        },
        {
            fields: ['jalur_id', 'urutan']
        }
    ]
});

export default Halte;