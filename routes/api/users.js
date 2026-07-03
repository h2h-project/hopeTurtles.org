import { Router } from 'express';
import {
  listUsers,
  createUser,
  updateUserRole,
  updateUserStatus,
  deactivateUser
} from '../../controllers/usersController.js';
import { ensureAuth } from '../../middleware/auth.js';

const router = Router();

// Temporarily open to any logged-in user (normally ensureAdmin) so users can
// self-assign roles while the team is being set up.
router.use(ensureAuth);

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);
router.delete('/:id', deactivateUser);

export default router;
