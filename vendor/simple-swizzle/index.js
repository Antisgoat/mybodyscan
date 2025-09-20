'use strict';

function normalizeArgs(args) {
  const list = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      list.push(...arg);
    } else {
      list.push(arg);
    }
  }
  return list;
}

function swizzle(args) {
  return normalizeArgs(args);
}

swizzle.wrap = function wrap(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function to wrap');
  }
  return function wrapped() {
    return fn.apply(this, normalizeArgs(arguments));
  };
};

module.exports = swizzle;
