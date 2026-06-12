import { Router } from 'express';
import authRoutes from './auth.routes.js';
import uploadRoutes from './upload.routes.js';
import analysisRoutes from './analysis.routes.js';
import reportsRoutes from './reports.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/upload', uploadRoutes);
router.use('/analysis', analysisRoutes);
router.use('/reports', reportsRoutes);

export default router;
