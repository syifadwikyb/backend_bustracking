import express from 'express';
import * as driverController from '../controllers/driverController.js';

const router = express.Router();

router.post('/', driverController.createDriver);       // Create
router.get('/', driverController.getDrivers);          // Read All
router.get('/:id', driverController.getDriverById);    // Read by ID
router.put('/:id', driverController.updateDriver);     // Update
router.delete('/:id', driverController.deleteDriver);  // Delete

export default router;
