function log(message) {
  console.log(`[vite-stub] ${message}`);
}

export function build() {
  log('build invoked');
  return Promise.resolve({ output: [] });
}

export async function createServer() {
  return {
    listen() {
      log('dev server stub');
    },
    close() {
      log('dev server closed');
    },
  };
}

export default {
  build,
};
