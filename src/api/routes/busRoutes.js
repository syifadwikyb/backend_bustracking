import express from 'express';
import * as busController from "../controllers/busController.js";

const router = express.Router();

router.post('/', busController.createBus);
router.get('/', busController.getAllBus);
router.get('/:id', busController.getBusById);
router.put('/:id', busController.updateBus);  
router.delete('/:id', busController.deleteBus)

export default router;
