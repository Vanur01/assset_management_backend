import express from 'express';
import RoleController from '../controllers/role.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

router.use(authenticate);
router.use(allowRoles('admin', 'super_admin'));

router.route('/')
    .post(RoleController.createRole)
    .get(RoleController.getAllRoles);

router.route('/:id')
    .get(RoleController.getRoleById)
    .put(RoleController.updateRole)
    .delete(RoleController.deleteRole);


export default router;