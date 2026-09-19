import NativeConfig from 'react-native-config';

const trimTrailingSlashes = value => value.replace(/\/+$/, '');

export const API_BASE = trimTrailingSlashes(
  NativeConfig.VITE_API_BASE || 'https://dev.aksharmandal.in/aksharconnect',
);

export const APP_VERSION = NativeConfig.VITE_APP_VERSION || '';

export const SWAGGER_ENDPOINT = NativeConfig.Swagger_Endpoint || '';

export default {
  API_BASE,
  APP_VERSION,
  SWAGGER_ENDPOINT,
};
