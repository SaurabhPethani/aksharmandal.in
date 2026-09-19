module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^react-native-blob-util$': '<rootDir>/__mocks__/react-native-blob-util.js',
    '^react-native-share$': '<rootDir>/__mocks__/react-native-share.js',
    '^@react-native-camera-roll/camera-roll$':
      '<rootDir>/__mocks__/@react-native-camera-roll/camera-roll.js',
    '^react-native-config$': '<rootDir>/__mocks__/react-native-config.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve('@react-native/jest-preset/jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-config|react-native-css-interop|@react-native-vector-icons)/)',
  ],
};
