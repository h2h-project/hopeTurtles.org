import { Router } from 'express';
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserStatus,
  deactivateUser,
  deleteUsers
} from '../../controllers/usersController.js';
import { ensureAdmin, ensureAuth } from '../../middleware/auth.js';

const router = Router();

router.use(ensureAuth, ensureAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.post('/delete', deleteUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);
router.delete('/:id', deactivateUser);

export default router;
