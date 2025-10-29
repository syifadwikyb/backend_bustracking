import Jalur from '../models/Jalur.js';
import Halte from '../models/Halte.js';
import Maintenance from "../models/Maintenance.js";
import Bus from "../models/Bus.js";
import Driver from "../models/Driver.js";
import Schedule from "../models/Schedule.js";

function setupAssociations() {    
  // 📍 Relasi Jalur ↔ Halte
  Jalur.hasMany(Halte, {
    foreignKey: 'jalur_id',
    as: 'halte',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  Halte.belongsTo(Jalur, {
    foreignKey: 'jalur_id',
    as: 'jalur'
  });

  // 🧰 Relasi Bus ↔ Maintenance
  Bus.hasMany(Maintenance, {
    foreignKey: 'bus_id',
    as: 'riwayat_perbaikan',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  Maintenance.belongsTo(Bus, {
    foreignKey: 'bus_id',
    as: 'bus'
  });

  // 🚌 Relasi utama Bus ↔ Schedule ↔ Driver ↔ Jalur
  Bus.hasMany(Schedule, {
    foreignKey: 'bus_id',
    as: 'jadwal', // 🟢 untuk relasi utama di dashboard
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  Driver.hasMany(Schedule, {
    foreignKey: 'driver_id',
    as: 'jadwal_driver', // 🟡 ubah alias
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  Jalur.hasMany(Schedule, {
    foreignKey: 'jalur_id',
    as: 'jadwal_jalur', // 🟠 ubah alias
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });

  Schedule.belongsTo(Bus, {
    foreignKey: 'bus_id',
    as: 'bus'
  });

  Schedule.belongsTo(Driver, {
    foreignKey: 'driver_id',
    as: 'driver'
  });

  Schedule.belongsTo(Jalur, {
    foreignKey: 'jalur_id',
    as: 'jalur'
  });
}

export default setupAssociations;
