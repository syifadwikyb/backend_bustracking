import Jalur from '../models/Jalur.js';
import Halte from '../models/Halte.js';
import Maintenance from "../models/Maintenance.js";
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import Schedule from "../models/Schedule.js";

function setupAssociations() {    
    Jalur.hasMany(Halte, {
        foreignKey: 'jalur_id',
        as: 'halte'
    });

    Halte.belongsTo(Jalur, {
        foreignKey: 'jalur_id',
        as: 'jalur'
    });

    Bus.hasMany(Maintenance, {
        foreignKey: 'bus_id',
        as: 'riwayat_perbaikan'
    });

    Maintenance.belongsTo(Bus, {
        foreignKey: 'bus_id',
        as: 'bus'
    });

    Bus.hasMany(Schedule, { foreignKey: 'bus_id', as: 'jadwal' });
    Driver.hasMany(Schedule, { foreignKey: 'driver_id', as: 'jadwal' });
    Jalur.hasMany(Schedule, { foreignKey: 'jalur_id', as: 'jadwal' });

    Schedule.belongsTo(Bus, { foreignKey: 'bus_id', as: 'bus' });
    Schedule.belongsTo(Driver, { foreignKey: 'driver_id', as: 'driver' });
    Schedule.belongsTo(Jalur, { foreignKey: 'jalur_id', as: 'jalur' });
}

export default setupAssociations;