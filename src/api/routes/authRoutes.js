import express from 'express';
import { register, login, changePassword } from '../controllers/authController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { loginLimiter } from '../middlewares/rate_limit_Middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.put('/change-password', authMiddleware, changePassword);

export default router;
