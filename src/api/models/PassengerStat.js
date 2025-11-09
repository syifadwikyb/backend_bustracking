import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const PassengerHistory = sequelize.define('PassengerHistory', {    
    id_stat: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    bus_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },    
    passenger_stat: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'passenger_history',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

export default PassengerHistory;
