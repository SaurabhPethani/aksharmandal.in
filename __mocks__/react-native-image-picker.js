module.exports = {
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
  launchCamera: jest.fn(async () => ({ didCancel: true })),
};
