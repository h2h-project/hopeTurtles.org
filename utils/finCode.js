// Turtle fin codes: a 4-character Crockford Base32 ID painted on the
// turtle's fin (turtles_tb.fin_code, sql/migrations/20261102_turtle_fin_code.sql).
//
// Alphabet drops I, L, O and U so a weathered fin can't be misread; on input
// O is read as 0 and I/L as 1, the Crockford decoding rule. 32^4 = 1,048,576
// codes, assigned at random so they can't be guessed in sequence.

import crypto from 'crypto';

export const FIN_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const FIN_CODE_LENGTH = 4;

export const generateFinCode = () => {
  let code = '';
  for (let i = 0; i < FIN_CODE_LENGTH; i += 1) {
    code += FIN_CODE_ALPHABET[crypto.randomInt(FIN_CODE_ALPHABET.length)];
  }
  return code;
};

// User input → canonical code, or null if it can't be one.
export const normalizeFinCode = (input) => {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== FIN_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!FIN_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
};

const isDuplicateFinCode = (error) =>
  error?.code === 'ER_DUP_ENTRY' && /fin_code/.test(String(error?.sqlMessage || error?.message || ''));

// Runs `write(code)` with fresh random codes until one doesn't collide with
// the UNIQUE key. With ~1M codes a retry is rare; 10 attempts is ample.
export const withUniqueFinCode = async (write, attempts = 10) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write(generateFinCode());
    } catch (error) {
      if (!isDuplicateFinCode(error) || attempt >= attempts) throw error;
    }
  }
};

export default { FIN_CODE_ALPHABET, FIN_CODE_LENGTH, generateFinCode, normalizeFinCode, withUniqueFinCode };
