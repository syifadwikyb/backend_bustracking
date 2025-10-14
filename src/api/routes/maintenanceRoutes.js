// src/api/routes/maintenanceRoutes.js

import express from 'express';
import * as maintenanceController from '../controllers/maintenanceController.js';

const router = express.Router();

router.post('/', maintenanceController.createMaintenance);
router.get('/', maintenanceController.getAllMaintenance);
router.get('/:id', maintenanceController.getMaintenanceById);
router.put('/:id', maintenanceController.updateMaintenance);
router.delete('/:id', maintenanceController.deleteMaintenance);

export default router;