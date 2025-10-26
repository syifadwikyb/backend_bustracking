// src/api/routes/dashboardRoutes.js
import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';

const router = express.Router();

router.get('/stats', dashboardController.getDashboardStats);
router.get('/live-bus', dashboardController.getLiveBusData);
router.get('/passenger-chart', dashboardController.getPassengerChartData);

export default router;