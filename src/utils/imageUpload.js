export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** The saved square, matching ImageCropDialog's own output size. */
const OUTPUT = 512;

export function tooLargeMessage(file) {
  const mb = ((file?.size || 0) / (1024 * 1024)).toFixed(1);
  return `That photo is ${mb} MB and exceeds the 2 MB limit — please choose a smaller one.`;
}

/**
 * Loaded on use, not at import: the module calls
 * `TurboModuleRegistry.getEnforcing` at the top level, so a plain import takes
 * the whole app down at startup on a binary built before the package was
 * installed. Same trap as the cropper in components/ImageCropDialog.
 */
function resizer() {
  try {
    return require('@bam.tech/react-native-image-resizer').default;
  } catch {
    return null;
  }
}

/**
 * Bake the photo's rotation into its pixels before it is uploaded.
 *
 * WHY THIS EXISTS. A phone photo records which way up it is as an EXIF tag
 * rather than by storing the pixels that way, and the crop we upload inherits
 * that: `@react-native-community/image-editor` decodes the region in the
 * image's RAW orientation and copies the original `TAG_ORIENTATION` onto its
 * output. The file is then only upright for a reader that honours the tag —
 * anything that re-encodes or thumbnails without it shows a sideways avatar.
 *
 * The web has never had this problem because it crops through a `<canvas>`:
 * the browser applies the tag when decoding, and `toBlob` writes upright
 * pixels with no EXIF at all. This is the same thing, done explicitly — the
 * resizer rotates by the tag and leaves `TAG_ORIENTATION` out of what it
 * copies, so what we send cannot be read the wrong way up.
 *
 * FALLS BACK RATHER THAN BREAKS. On a binary built before the resizer was
 * installed, the original file is uploaded unchanged: an avatar that may be
 * rotated, which is what happened before this existed, rather than a photo
 * that cannot be set at all. Rebuild the app to get the fix.
 */
export async function prepareProfilePhoto(file) {
  const library = resizer();
  if (!library || !file?.uri) return file;

  try {
    const upright = await library.createResizedImage(
      file.uri,
      OUTPUT,
      OUTPUT,
      'JPEG',
      90,
      // No rotation of our own — only what the file's own EXIF asks for.
      0,
      null,
      // Drop the metadata. The tag is excluded from the copy either way, but
      // an avatar has no business carrying the camera and GPS tags with it.
      false,
      { mode: 'contain', onlyScaleDown: true },
    );

    return {
      // The name is ours, not the temp file's: it is what the server stores.
      uri: upright.uri,
      name: file.name || 'photo.jpg',
      type: 'image/jpeg',
      size: upright.size,
    };
  } catch {
    return file;
  }
}
