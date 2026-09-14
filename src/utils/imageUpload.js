export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function tooLargeMessage(file) {
  const mb = ((file?.size || 0) / (1024 * 1024)).toFixed(1);
  return `That photo is ${mb} MB and exceeds the 2 MB limit — please choose a smaller one.`;
}

export async function prepareProfilePhoto(file) {
  return file;
}
