module.exports = {
  __esModule: true,
  default: {
    cropImage: jest.fn(async () => ({
      uri: 'file:///tmp/cropped.jpg',
      name: 'cropped.jpg',
      type: 'image/jpeg',
      size: 1024,
      width: 512,
      height: 512,
    })),
  },
};
