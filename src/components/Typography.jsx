import React, { forwardRef } from 'react';
import { Text as NativeText, TextInput as NativeTextInput } from 'react-native';
import { FONT_FAMILY } from '../constants/typography';

export const Text = ({ style, ...props }) => (
  <NativeText {...props} style={[{ fontFamily: FONT_FAMILY }, style]} />
);

export const TextInput = forwardRef(({ style, ...props }, ref) => (
  <NativeTextInput
    ref={ref}
    {...props}
    style={[{ fontFamily: FONT_FAMILY }, style]}
  />
));

TextInput.displayName = 'TextInput';
