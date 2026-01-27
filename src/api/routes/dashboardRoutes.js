// src/api/routes/dashboardRoutes.js
import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/', dashboardController.getDashboardData); 
router.get('/utilization', dashboardController.getBusUtilization);

export default router;