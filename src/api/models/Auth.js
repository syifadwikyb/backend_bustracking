import { DataTypes } from "sequelize";
import sequelize from "../config/db.js";

const Auth = sequelize.define("Auth", {
    id_admin: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
            notEmpty: true,
            len: [3, 100]
        }
    },
    password: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    },
}, {
    tableName: "auth",
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['username']
        }
    ]
});

export default Auth;