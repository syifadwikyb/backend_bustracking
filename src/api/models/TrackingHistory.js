// models/TrackingHistory.js
import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const TrackingHistory = sequelize.define(
  "TrackingHistory",
  {
    id_history: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bus_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: false,
      validate: {
        isDecimal: true,
      },
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: false,
      validate: {
        isDecimal: true,
      },
    },
    speed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    passenger_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
  },
  {
    tableName: "tracking_history",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        fields: ["bus_id"],
      },
      {
        fields: ["bus_id", "created_at"],
      },
    ],
  },
);

export default TrackingHistory;