const { REGEX_LINK, REGEX_CONVITE } = require('../../config');

function temLink(texto) {
  if (!texto) return false;
  const t = String(texto).replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, '');
  return REGEX_LINK.test(t) || REGEX_CONVITE.test(t);
}

module.exports = { temLink };
