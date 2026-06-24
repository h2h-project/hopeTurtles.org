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
 * via the Buwana profile API, using the session's access token. ALWAYS returns
 * an object: { profile, reference, error }. On failure profile is null and error
 * holds a human-readable reason (no token, 401 token_expired, 403
 * insufficient_scope / not_connected, …). The page surfaces `error` so a failed
 * read is visible rather than silently showing blank country/community/language.
 *
 * Note: this call is server-to-server (Node → Buwana), so CORS never applies —
 * any failure here is an auth/scope/connection problem, not a CORS one.
 */
const EMPTY_REFERENCE = { languages: [], timezones: {} };

const fetchBuwanaProfile = async (req) => {
  const token = getAccessToken(req);
  if (!token) {
    const error = 'No Buwana access token in your session — please log out and back in.';
    console.warn(`[profile] ${error}`);
    return { profile: null, reference: EMPTY_REFERENCE, error };
  }
  const url = `${BUWANA_API}/api/profile.php`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      // e.g. 401 token_expired (re-login) or 403 insufficient_scope / not_connected.
      const text = await res.text().catch(() => '');
      let code = '';
      try { code = (JSON.parse(text).error) || ''; } catch (_) { /* non-JSON body */ }
      const error = `Buwana profile API returned HTTP ${res.status}${code ? ` (${code})` : ''}.`;
      console.warn(`[profile] ${error} Body: ${text.slice(0, 300)}`);
      return { profile: null, reference: EMPTY_REFERENCE, error };
    }
    const data = await res.json();
    if (data.status !== 'succeeded' || !data.profile) {
      const error = `Buwana profile API returned an unexpected payload (status: ${data.status || 'none'}).`;
      console.warn(`[profile] ${error}`, JSON.stringify(data).slice(0, 300));
      return { profile: null, reference: EMPTY_REFERENCE, error };
    }
    return {
      profile: data.profile,
      reference: data.reference || EMPTY_REFERENCE,
      error: null
    };
  } catch (err) {
    // "fetch failed" is undici's generic wrapper; the real reason (DNS ENOTFOUND,
    // ECONNREFUSED, TLS, timeout, …) lives on err.cause. Surface it plus the URL
    // we actually tried so a misconfigured BUWANA_API_URL is obvious.
    const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    const error = `Could not reach the Buwana profile API at ${url}: ${err.message}${cause}`;
    console.warn(`[profile] ${error}`);
    return { profile: null, reference: EMPTY_REFERENCE, error };
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
      buwanaProfile: buwana.profile,
      buwanaReference: buwana.reference,
      buwanaEditable: Boolean(buwana.profile),
      buwanaError: buwana.error,
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
    if (!current.profile) {
      setProfileFeedback(req, 'error', current.error || 'Could not reach your Buwana account. Please log in again.');
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
