import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

const usersModel = createModel('users_tb', 'buwana_id');

const selectableFields = [
  'buwana_id',
  'email',
  'full_name',
  'role',
  'account_status',
  'created_at',
  'last_login',
  'earthling_emoji'
];

usersModel.listUsers = async (filters = {}) => {
  const allowedFilters = ['account_status', 'role'];
  const clauses = [];
  const values = [];

  allowedFilters.forEach((field) => {
    const value = filters[field];
    if (value === undefined || value === null || value === '') {
      return;
    }
    clauses.push(`\`${field}\` = ?`);
    values.push(value);
  });

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT ${selectableFields.map((field) => `\`${field}\``).join(', ')} FROM \`users_tb\` ${where} ORDER BY \`buwana_id\` DESC`;
  return query(sql, values);
};

usersModel.createUser = async (userData) => {
  const payload = {
    buwana_id: userData.buwana_id,
    email: userData.email,
    first_name: userData.first_name,
    last_name: userData.last_name ?? null,
    full_name:
      userData.full_name ??
      (userData.last_name ? `${userData.first_name} ${userData.last_name}` : userData.first_name),
    username: userData.username ?? null,
    account_status: userData.account_status ?? 'active',
    created_at: userData.created_at ?? new Date(),
    last_login: userData.last_login ?? null,
    role: userData.role ?? 'user',
    language_id: userData.language_id ?? 'EN',
    location_watershed: userData.location_watershed,
    location_full: userData.location_full ?? null,
    country_id: userData.country_id ?? null,
    watershed_id: userData.watershed_id ?? null,
    notes: userData.notes ?? null,
    flagged: userData.flagged ?? 0,
    profile_pic: userData.profile_pic ?? 'null',
    earthen_newsletter_join: userData.earthen_newsletter_join ?? 1,
    login_count: userData.login_count ?? 0,
    birth_date: userData.birth_date ?? null,
    deleteable: userData.deleteable ?? 0,
    continent_code: userData.continent_code ?? null,
    earthling_emoji: userData.earthling_emoji ?? null,
    location_lat: userData.location_lat ?? null,
    location_long: userData.location_long ?? null,
    community_id: userData.community_id ?? null,
    time_zone: userData.time_zone ?? null,
    tour_taken: userData.tour_taken ?? 0,
    last_sync_ts: userData.last_sync_ts ?? null
  };

  return usersModel.create(payload);
};

usersModel.updateRole = async (buwanaId, role) => {
  const existing = await usersModel.getById(buwanaId);
  if (!existing) {
    return null;
  }
  return usersModel.update(buwanaId, { role });
};

usersModel.updateStatus = async (buwanaId, accountStatus) => {
  const existing = await usersModel.getById(buwanaId);
  if (!existing) {
    return null;
  }
  return usersModel.update(buwanaId, { account_status: accountStatus });
};

usersModel.deactivateUser = async (buwanaId) => {
  return usersModel.updateStatus(buwanaId, 'suspended');
};

usersModel.findByBuwanaId = async (buwanaId) => {
  return usersModel.getById(buwanaId);
};

const deriveNameParts = (user) => {
  const trimmedFull = typeof user.full_name === 'string' ? user.full_name.trim() : '';
  const providedFirst = user.first_name && user.first_name.trim();
  const providedLast = user.last_name && user.last_name.trim();

  let firstName = providedFirst || '';
  let lastName = providedLast || '';

  if (!firstName && trimmedFull) {
    const [first, ...rest] = trimmedFull.split(/\s+/u);
    firstName = first || '';
    if (!lastName && rest.length) {
      lastName = rest.join(' ');
    }
  }

  const safeFirst = firstName || 'Crew';
  const safeLast = lastName || null;
  const safeFull = trimmedFull || (safeLast ? `${safeFirst} ${safeLast}` : safeFirst);

  return {
    firstName: safeFirst,
    lastName: safeLast,
    fullName: safeFull
  };
};

usersModel.upsertFromBuwana = async (user) => {
  const existing = await usersModel.getById(user.buwana_id);

  const placeholderEmail = `user-${user.buwana_id}@placeholder.local`;

  const { firstName, lastName, fullName } = deriveNameParts(user);

  if (existing) {
    const updateData = {
      last_login: user.last_login ?? new Date()
    };

    if (user.role !== undefined || !existing.role) {
      updateData.role = user.role ?? existing.role ?? 'user';
    }

    if (user.email !== undefined) {
      updateData.email = user.email ?? existing.email ?? placeholderEmail;
    }

    if (user.first_name !== undefined || !existing.first_name) {
      updateData.first_name = user.first_name ?? existing.first_name ?? firstName;
    }

    if (user.last_name !== undefined || !existing.last_name) {
      updateData.last_name = user.last_name ?? existing.last_name ?? lastName;
    }

    if (user.full_name !== undefined || !existing.full_name) {
      updateData.full_name = user.full_name ?? existing.full_name ?? fullName;
    }

    if (user.language_id !== undefined || !existing.language_id) {
      updateData.language_id = user.language_id ?? existing.language_id ?? 'EN';
    }

    // buwana:basic — sync emoji if provided
    if (user.earthling_emoji !== undefined) {
      updateData.earthling_emoji = user.earthling_emoji;
    }

    // buwana:profile — sync only when the claim was present in the token
    if (user.profile_pic !== undefined) updateData.profile_pic = user.profile_pic;
    if (user.community_id !== undefined) updateData.community_id = user.community_id;
    if (user.time_zone !== undefined)    updateData.time_zone = user.time_zone;
    if (user.birth_date !== undefined)   updateData.birth_date = user.birth_date;

    // buwana:bioregion — sync only when the claim was present in the token
    if (user.location_full !== undefined)      updateData.location_full = user.location_full;
    if (user.watershed_id !== undefined)       updateData.watershed_id = user.watershed_id;
    if (user.location_watershed !== undefined) updateData.location_watershed = user.location_watershed;
    if (user.location_lat !== undefined)       updateData.location_lat = user.location_lat;
    if (user.location_long !== undefined)      updateData.location_long = user.location_long;

    await usersModel.update(user.buwana_id, updateData);
    return usersModel.getById(user.buwana_id);
  }

  await usersModel.create({
    buwana_id:          user.buwana_id,
    email:              user.email ?? placeholderEmail,
    first_name:         user.first_name ?? firstName,
    last_name:          user.last_name ?? lastName,
    full_name:          user.full_name ?? fullName,
    role:               user.role ?? 'user',
    created_at:         user.created_at ?? new Date(),
    last_login:         user.last_login ?? new Date(),
    language_id:        user.language_id ?? 'EN',
    earthling_emoji:    user.earthling_emoji ?? null,
    profile_pic:        user.profile_pic ?? null,
    community_id:       user.community_id ?? null,
    time_zone:          user.time_zone ?? null,
    birth_date:         user.birth_date ?? null,
    location_full:      user.location_full ?? null,
    watershed_id:       user.watershed_id ?? null,
    location_watershed: user.location_watershed ?? null,
    location_lat:       user.location_lat ?? null,
    location_long:      user.location_long ?? null
  });

  return usersModel.getById(user.buwana_id);
};

usersModel.getActiveCount = async () => {
  const rows = await query('SELECT COUNT(*) AS total FROM users_tb WHERE account_status = "active"');
  return rows[0]?.total || 0;
};

usersModel.getDashboardStats = async () => {
  const [row] = await query(
    `SELECT
      COUNT(*) AS total_users,
      SUM(account_status = 'active') AS active_users,
      SUM(account_status = 'suspended') AS suspended_users,
      SUM(created_at >= (NOW() - INTERVAL 1 DAY)) AS joined_last_24h,
      SUM(role = 'admin') AS admin_users
    FROM users_tb`
  );

  return {
    totalUsers: Number(row?.total_users ?? 0),
    activeUsers: Number(row?.active_users ?? 0),
    suspendedUsers: Number(row?.suspended_users ?? 0),
    joinedLast24Hours: Number(row?.joined_last_24h ?? 0),
    adminUsers: Number(row?.admin_users ?? 0)
  };
};

usersModel.getTeamMembers = async () => {
  const sql = `
    SELECT
      buwana_id,
      full_name,
      team_title,
      country_id,
      location_watershed,
      continent_code,
      earthling_emoji,
      location_full,
      profile_txt,
      profile_pic
    FROM users_tb
    WHERE team_title IS NOT NULL AND TRIM(team_title) <> ''
    ORDER BY COALESCE(full_name, team_title) ASC
  `;

  return query(sql);
};

export default usersModel;
