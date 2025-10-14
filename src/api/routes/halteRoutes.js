import express from 'express';
import * as halteController from '../controllers/halteController.js';

const router = express.Router();

router.post('/', halteController.createHalte);
router.get('/', halteController.getAllHalte);
router.get('/:id', halteController.getHalteById);
router.put('/:id', halteController.updateHalte);
router.delete('/:id', halteController.deleteHalte);

export default router;
