import { DataTypes } from 'sequelize';
import sequelize from "../config/db.js";

const PassengerHistory = sequelize.define('PassengerHistory', {    
    id_penumpang: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    bus_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },    
    jumlah_penumpang: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'passenger_history',
    timestamps: false
});

export default PassengerHistory;