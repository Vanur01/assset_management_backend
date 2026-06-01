import express from 'express';
import LocationController from '../controllers/location.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

router.use(authenticate);
router.use(allowRoles('admin', 'super_admin'));

router.route('/')
    .post(LocationController.createLocation)
    .get(LocationController.getAllLocations);

router.route('/:id')
    .get(LocationController.getLocationById)
    .put(LocationController.updateLocation)
    .delete(LocationController.deleteLocation);

export default router;