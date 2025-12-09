import express from 'express';
import * as busController from "../controllers/busController.js";
import { upload } from "../middlewares/uploadMiddleware.js"; // Import Middleware

const router = express.Router();

router.get('/', busController.getAllBus);
router.get('/:id', busController.getBusById);
router.post('/', upload.single('foto'), busController.createBus);
router.put('/:id', upload.single('foto'), busController.updateBus); 
router.delete('/:id', busController.deleteBus);

export default router;