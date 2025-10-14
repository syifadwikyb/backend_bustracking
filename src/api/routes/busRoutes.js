import express from 'express';
import * as busController from "../controllers/busController.js";

const router = express.Router();

router.post('/', busController.createBus);       // Create
router.get('/', busController.getAllBus);          // Read All
router.get('/:id', busController.getBusById);    // Read by ID
router.put('/:id', busController.updateBus);     // Update
router.delete('/:id', busController.deleteBus);  // Delete

export default router;
