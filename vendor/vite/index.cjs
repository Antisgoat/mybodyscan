function log(message) {
  console.log(`[vite-stub] ${message}`);
}

function build() {
  log('build invoked');
  return Promise.resolve({ output: [] });
}

module.exports = {
  build,
  createServer: async () => ({ listen: () => log('dev server stub'), close: () => log('dev server closed') }),
  default: {
    build,
  },
};
