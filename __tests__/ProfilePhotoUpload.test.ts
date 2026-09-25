import { prepareProfilePhoto } from '../src/utils/imageUpload';

const mockCreateResizedImage = jest.fn();

jest.mock(
  '@bam.tech/react-native-image-resizer',
  () => ({
    default: {
      createResizedImage: (...args: unknown[]) =>
        mockCreateResizedImage(...args),
    },
  }),
  { virtual: true },
);

const CROPPED = {
  uri: 'file:///cache/crop-1.jpg',
  name: 'selfie.jpg',
  type: 'image/jpeg',
  size: 91_000,
};

beforeEach(() => mockCreateResizedImage.mockReset());

test('the uploaded photo is re-encoded upright, under our own name', async () => {
  mockCreateResizedImage.mockResolvedValue({
    uri: 'file:///cache/upright-1.jpg',
    path: '/cache/upright-1.jpg',
    name: 'upright-1.jpg',
    size: 74_000,
    width: 512,
    height: 512,
  });

  const prepared = await prepareProfilePhoto(CROPPED);

  expect(prepared).toEqual({
    uri: 'file:///cache/upright-1.jpg',
    // The temp file's generated name is not what the server should store.
    name: 'selfie.jpg',
    type: 'image/jpeg',
    size: 74_000,
  });

  const [uri, width, height, format, quality, rotation, , keepMeta] =
    mockCreateResizedImage.mock.calls[0];
  expect(uri).toBe(CROPPED.uri);
  expect([width, height]).toEqual([512, 512]);
  expect(format).toBe('JPEG');
  expect(quality).toBe(90);
  // Only the rotation the file's own EXIF asks for, and no metadata carried
  // over — that pairing is what makes the upload orientation-proof.
  expect(rotation).toBe(0);
  expect(keepMeta).toBe(false);
});

test('a photo that cannot be re-encoded is still uploaded', async () => {
  mockCreateResizedImage.mockRejectedValue(new Error('no native module'));

  // Degrades to the old behaviour — an avatar that may be rotated — rather
  // than refusing to set a photo at all.
  await expect(prepareProfilePhoto(CROPPED)).resolves.toBe(CROPPED);
});

test('a file with no uri is passed straight through', async () => {
  const odd = { name: 'x.jpg' } as never;
  await expect(prepareProfilePhoto(odd)).resolves.toBe(odd);
  expect(mockCreateResizedImage).not.toHaveBeenCalled();
});
