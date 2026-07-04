// Buwana JWTs can carry more than one role in a single `role` claim. It arrives
// either as an array or as a comma/semicolon-separated string such as
// "Ecobricker, GEA Trainer of Trainer, GEA Trainer, Admin, Center Circle".
// These helpers normalize that value so a user who holds the admin role — even
// alongside several others — is still recognized as an admin. Matching is
// case-insensitive ("Admin" === "admin").

export const parseRoles = (role) => {
  if (Array.isArray(role)) {
    return role.flatMap((entry) => parseRoles(entry));
  }
  if (typeof role !== 'string') {
    return [];
  }
  return role
    .split(/[,;]/u)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

export const hasRole = (role, target) => {
  const wanted = String(target).trim().toLowerCase();
  return parseRoles(role).includes(wanted);
};

export const isAdminRole = (role) => hasRole(role, 'admin');

export default { parseRoles, hasRole, isAdminRole };
