import { DataTypes } from 'sequelize';
import db from '../config/db.js';

const TrackingHistory = db.define('tracking_history', {
  id_history: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bus_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false
  },
  speed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'tracking_history',
  timestamps: true, // Mengaktifkan created_at dan updated_at otomatis
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default TrackingHistory;