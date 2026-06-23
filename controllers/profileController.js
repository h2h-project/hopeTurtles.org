import path from 'path';
import usersModel from '../models/usersModel.js';
import config from '../config/env.js';

const BUWANA_API = config.auth.buwanaApiUrl;

const getCurrentUserId = (req) => req.session?.user?.buwanaId ?? req.session?.user?.id ?? null;
const getAccessToken = (req) => req.session?.tokens?.accessToken || null;

// "private" flag is stored as a token inside the users_tb.notes free-text field.
const NOTE_PRIVATE = 'private';
const accountIsPrivate = (notes) =>
  new RegExp(`(^|[\\s,;])${NOTE_PRIVATE}([\\s,;]|$)`, 'i').test(notes || '');
const setNotesPrivate = (notes, makePrivate) => {
  const current = (notes || '').trim();
  const has = accountIsPrivate(current);
  if (makePrivate && !has) {
    return current ? `${current} ${NOTE_PRIVATE}` : NOTE_PRIVATE;
  }
  if (!makePrivate && has) {
    const cleaned = current
      .split(/[\s,;]+/)
      .filter((t) => t.toLowerCase() !== NOTE_PRIVATE)
      .join(' ')
      .trim();
    return cleaned || null;
  }
  return current || null;
};

const getProfileFeedback = (req) => {
  const feedback = req.session?.profileFeedback || null;
  if (req.session) {
    req.session.profileFeedback = null;
  }
  return feedback;
};

const setProfileFeedback = (req, type, message) => {
  if (!req.session) {
    return;
  }
  req.session.profileFeedback = { type, message };
};

/**
 * Fetch the authoritative Buwana profile + form reference (languages, timezones)
 * via the Buwana profile API, using the session's access token. Returns
 * { profile, reference } or null when unavailable (no token, expired, or the
 * app lacks the buwana:profile.read scope) — callers fall back to the local
 * mirror and disable Buwana editing.
 */
const fetchBuwanaProfile = async (req) => {
  const token = getAccessToken(req);
  if (!token) {
    console.warn('[profile] No access token in session — cannot reach Buwana profile API.');
    return null;
  }
  try {
    const res = await fetch(`${BUWANA_API}/api/profile.php`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      // Surfaces 403 insufficient_scope (app/scope not registered) or 401
      // token_expired (user needs to re-login) in the server logs.
      const text = await res.text().catch(() => '');
      console.warn(`[profile] Buwana profile API HTTP ${res.status}: ${text.slice(0, 300)}`);
      return null;
    }
    const data = await res.json();
    if (data.status !== 'succeeded' || !data.profile) {
      console.warn('[profile] Buwana profile API unexpected payload:', JSON.stringify(data).slice(0, 300));
      return null;
    }
    return {
      profile: data.profile,
      reference: data.reference || { languages: [], timezones: {} }
    };
  } catch (err) {
    console.warn('[profile] Buwana profile fetch failed:', err.message);
    return null;
  }
};

export const renderProfilePage = async (req, res, next) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.redirect('/login');
    }
    const profileUser = await usersModel.findByBuwanaId(userId);
    if (!profileUser) {
      return res.status(404).render('error', {
        pageTitle: 'Profile not found',
        message: 'We could not find your profile details.'
      });
    }
    const buwana = await fetchBuwanaProfile(req);
    const profileFeedback = getProfileFeedback(req);
    return res.render('profile', {
      pageTitle: 'Your Profile',
      profileUser,
      buwanaProfile: buwana?.profile || null,
      buwanaReference: buwana?.reference || { languages: [], timezones: {} },
      buwanaEditable: Boolean(buwana),
      isPrivate: accountIsPrivate(profileUser.notes),
      profileFeedback
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Update the HopeTurtle-local profile fields (title, bio, photo) in users_tb.
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.redirect('/login');
    }

    const updates = {};
    const hasTitleField = Object.prototype.hasOwnProperty.call(req.body || {}, 'team_title');
    const hasProfileField = Object.prototype.hasOwnProperty.call(req.body || {}, 'profile_txt');

    if (hasTitleField) {
      const rawTitle = typeof req.body.team_title === 'string' ? req.body.team_title.trim() : '';
      updates.team_title = rawTitle || null;
    }

    if (hasProfileField) {
      const rawProfile = typeof req.body.profile_txt === 'string' ? req.body.profile_txt.trim() : '';
      updates.profile_txt = rawProfile || null;
    }

    if (req.file) {
      updates.profile_pic = path.posix.join('/uploads', req.file.filename);
    }

    const hasUpdates = Object.keys(updates).length > 0;
    if (!hasUpdates) {
      setProfileFeedback(req, 'error', 'Please provide details to update.');
      return res.redirect('/profile');
    }

    await usersModel.update(userId, updates);
    setProfileFeedback(req, 'success', 'Profile updated successfully.');
    return res.redirect('/profile');
  } catch (error) {
    setProfileFeedback(req, 'error', error.message || 'Unable to update your profile.');
    return res.redirect('/profile');
  }
};

/**
 * Update the editable Buwana-account fields (emoji, location, watershed,
 * language, timezone). Buwana is the source of truth, so we update it via the
 * profile API, then mirror the fresh values into the local users_tb. Country +
 * continent are derived by Buwana from the location and never sent.
 */
export const updateBuwanaProfile = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.redirect('/login');
    }
    const token = getAccessToken(req);
    if (!token) {
      setProfileFeedback(req, 'error', 'Please log in again to update your Buwana account.');
      return res.redirect('/profile');
    }

    // 1) Authoritative current profile — needed so we can resubmit every required field.
    const current = await fetchBuwanaProfile(req);
    if (!current) {
      setProfileFeedback(req, 'error', 'Could not reach your Buwana account. Please log in again.');
      return res.redirect('/profile');
    }
    const cur = current.profile;
    const body = req.body || {};
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const numOr = (v, fallback) => (v === '' || v == null ? fallback : Number(v));

    // 2) Merge edits over the current values (only the editable fields change).
    const payload = {
      first_name:         cur.first_name,
      last_name:          cur.last_name,
      birth_date:         cur.birth_date || '',
      community_id:       cur.community_id,
      earthling_emoji:    str(body.earthling_emoji) || cur.earthling_emoji,
      language_id:        body.language_id || cur.language_id,
      time_zone:          body.time_zone || cur.time_zone,
      location_full:      str(body.location_full) || cur.location_full,
      latitude:           numOr(body.latitude, cur.location_lat),
      longitude:          numOr(body.longitude, cur.location_long),
      location_watershed: str(body.location_watershed) || cur.location_watershed
    };

    // 3) Update Buwana (it validates + derives country/continent and returns the fresh profile).
    const apiRes = await fetch(`${BUWANA_API}/api/profile_update.php`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok || data.status !== 'succeeded' || !data.profile) {
      setProfileFeedback(req, 'error', data.message || data.error || 'Buwana update failed. Please try again.');
      return res.redirect('/profile');
    }

    // 4) Mirror the fresh, Buwana-derived values into the local users_tb.
    const p = data.profile;
    await usersModel.update(userId, {
      earthling_emoji:    p.earthling_emoji ?? null,
      language_id:        p.language_id ?? cur.language_id,
      time_zone:          p.time_zone ?? null,
      location_full:      p.location_full ?? null,
      location_watershed: p.location_watershed ?? '',
      location_lat:       p.location_lat ?? null,
      location_long:      p.location_long ?? null,
      country_id:         p.country_id ?? null,
      continent_code:     p.continent_code ?? null,
      community_id:       p.community_id ?? null
    });

    setProfileFeedback(req, 'success', 'Your Buwana account was updated.');
    return res.redirect('/profile');
  } catch (error) {
    setProfileFeedback(req, 'error', error.message || 'Unable to update your Buwana account.');
    return res.redirect('/profile');
  }
};

/**
 * Toggle public visibility by adding/removing the "private" token in users_tb.notes.
 * Called via AJAX from the profile page; returns JSON.
 */
export const updatePrivacy = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not logged in.' });
    }
    const makePrivate = req.body?.private === true || req.body?.private === 'true';
    const user = await usersModel.findByBuwanaId(userId);
    const newNotes = setNotesPrivate(user?.notes, makePrivate);
    await usersModel.update(userId, { notes: newNotes });
    return res.json({ success: true, isPrivate: makePrivate });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message || 'Unable to update privacy.' });
  }
};

export default {
  renderProfilePage,
  updateProfile,
  updateBuwanaProfile,
  updatePrivacy
};
