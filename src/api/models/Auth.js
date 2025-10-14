import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Auth = sequelize.define("Auth", {
    id_admin: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: "auth",
    timestamps: true
});

export default Auth;
