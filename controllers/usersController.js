import usersModel from '../models/usersModel.js';
import { isAdminRole } from '../utils/roles.js';

const VALID_STATUSES = ['active', 'suspended', 'deleted'];
const ROLE_OPTIONS = [
  { value: 'user', label: 'Basic user' },
  { value: 'turtle_master', label: 'Turtle master' },
  { value: 'hub_master', label: 'Hub master' },
  { value: 'core_team', label: 'Core team' },
  { value: 'admin', label: 'Admin' }
];

export const renderManagementPage = async (req, res, next) => {
  try {
    const sessionUser = req.session?.user || null;
    const buwanaId = sessionUser?.buwanaId ?? sessionUser?.id ?? null;
    const dashboardUser = buwanaId ? await usersModel.findByBuwanaId(buwanaId) : null;

    const users = await usersModel.listUsers();
    const canEditRoles = isAdminRole(req.session?.user?.role);
    return res.render('manage-users', {
      pageTitle: 'Manage Users',
      users,
      roleOptions: ROLE_OPTIONS,
      canEditRoles,
      dashboardUser
    });
  } catch (error) {
    return next(error);
  }
};

export const listUsers = async (req, res, next) => {
  try {
    const filters = {
      account_status: req.query.status,
      role: req.query.role
    };
    const users = await usersModel.listUsers(filters);
    return res.json({ success: true, data: users });
  } catch (error) {
    return next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const requiredFields = ['buwana_id', 'email', 'first_name', 'location_watershed'];
    const missing = requiredFields.filter((field) => req.body[field] === undefined || req.body[field] === null);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const newUser = await usersModel.createUser(req.body);
    return res.status(201).json({ success: true, data: newUser });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'User with provided identifiers already exists' });
    }
    return next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }

    const updated = await usersModel.updateRole(req.params.id, role);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { account_status: status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid account status' });
    }

    const updated = await usersModel.updateStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const updated = await usersModel.deactivateUser(req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, data: updated, message: 'User deactivated' });
  } catch (error) {
    return next(error);
  }
};

export const deleteUsers = async (req, res, next) => {
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map((id) => String(id).trim()).filter(Boolean))];

    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No users selected for deletion' });
    }

    const sessionUser = req.session?.user || null;
    const currentId = sessionUser?.buwanaId ?? sessionUser?.id ?? null;

    const deleted = [];
    const skipped = [];

    for (const id of ids) {
      // An admin should never be able to delete their own account.
      if (currentId != null && String(currentId) === id) {
        skipped.push({ id, reason: 'You cannot delete your own account.' });
        continue;
      }

      // Deleted one at a time so each id gets its own deleted/skipped verdict.
      // eslint-disable-next-line no-await-in-loop
      const removed = await usersModel.deleteUser(id);
      if (removed) {
        deleted.push(id);
      } else {
        skipped.push({ id, reason: 'User not found.' });
      }
    }

    return res.json({
      success: true,
      data: { deleted, skipped },
      message: `Deleted ${deleted.length} user${deleted.length === 1 ? '' : 's'}.`
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  renderManagementPage,
  listUsers,
  createUser,
  updateUserRole,
  updateUserStatus,
  deactivateUser,
  deleteUsers
};
