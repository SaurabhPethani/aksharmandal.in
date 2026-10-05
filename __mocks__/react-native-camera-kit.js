// Jest mock for react-native-camera-kit — it ships untranspiled ESM and wraps a
// native view, so tests use this stub in place of the real camera. Mirrors the
// other native-module mocks in this folder.
const React = require('react');
const { View } = require('react-native');

const Camera = React.forwardRef((props, ref) =>
  React.createElement(View, { ...props, ref }),
);
Camera.displayName = 'Camera';

module.exports = {
  Camera,
  CameraType: { Front: 'front', Back: 'back' },
};
