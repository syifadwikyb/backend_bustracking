import express from 'express';
import * as driverController from '../controllers/driverController.js';
import { upload } from '../middlewares/uploadMiddleware.js'; 

const router = express.Router();

router.get('/', driverController.getDrivers);
router.get('/:id', driverController.getDriverById);
router.post('/', upload.single('foto'), driverController.createDriver);
router.put('/:id', upload.single('foto'), driverController.updateDriver);
router.delete('/:id', driverController.deleteDriver);

export default router;