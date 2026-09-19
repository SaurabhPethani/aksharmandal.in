const ReactNativeBlobUtil = {
  fs: {
    dirs: { CacheDir: '/tmp' },
    unlink: jest.fn(),
  },
  config: jest.fn(() => ({
    fetch: jest.fn(),
  })),
};

module.exports = ReactNativeBlobUtil;
