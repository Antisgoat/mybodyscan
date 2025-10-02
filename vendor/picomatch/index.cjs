function isMatch() {
  return false;
}

function picomatch() {
  return () => false;
}

module.exports = Object.assign(picomatch, { isMatch, default: picomatch });
