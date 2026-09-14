module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: '.env',
      allowlist: ['VITE_API_BASE', 'VITE_APP_VERSION'],
    }],
    'react-native-worklets/plugin', // This plugin needs to be listed at the last
  ],
};
