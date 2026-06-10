import crypto from 'crypto';

export const sha256Hex = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

export default { sha256Hex };
