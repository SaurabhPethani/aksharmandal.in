import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { apiUrl } from '../../api/client';
import { eventsService } from '../../services/eventsService';
import { prepareProfilePhoto, MAX_UPLOAD_BYTES, tooLargeMessage } from '../../utils/imageUpload';

/**
 * Event image: pick a file to upload, preview it, or remove it — the same shape
 * of control the profile photo uses, replacing the old "paste a URL" input.
 *
 * `value` is whatever sits in `event.image`: an uploaded URL, a pasted URL, a
 * data URI (how older events were saved), or empty. Upload resizes the photo
 * client-side (shared with the avatar path) so a phone photo lands well under
 * the 2 MB / 1 MB limits, POSTs it to /event-image, and reports the returned URL
 * up via `onChange`. Remove clears the field; the stored file, if any, is left
 * as a harmless orphan rather than deleted out from under a not-yet-saved event.
 */
function imageSrc(v) {
  if (!v) return null;
  return /^(https?:|data:|blob:|\/\/)/i.test(v) ? v : apiUrl(v);
}

export default function EventImageField({ value, onChange, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const src = imageSrc(value);

  const pick = () => { if (!busy && !disabled) inputRef.current?.click(); };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a remove
    if (!file) return;
    setError(null);

    if (!/^image\//.test(file.type)) {
      setError('Please choose an image file (JPEG, PNG or WEBP).');
      return;
    }
    setBusy(true);
    try {
      // Shrink first (also converts HEIC via the canvas path); if it cannot and
      // the original is over the limit, say so plainly rather than 413-ing.
      const prepared = await prepareProfilePhoto(file);
      if (prepared.size > MAX_UPLOAD_BYTES) {
        setError(tooLargeMessage(prepared));
        return;
      }
      const res = await eventsService.uploadEventImage(prepared);
      const url = res?.image_url;
      if (!url) throw new Error('Upload did not return an image URL.');
      onChange(url);
    } catch (err) {
      setError(err?.message ?? 'Could not upload the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-1.5 block text-sm font-semibold text-primary">Image</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFile}
        disabled={disabled || busy}
      />

      {src ? (
        <div className="flex items-start gap-3">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-control border border-line-soft bg-bg">
            <img src={src} alt="Event" className="h-full w-full object-contain" />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={pick}
              disabled={disabled || busy}
              className="inline-flex items-center gap-1.5 rounded-control border border-line-strong px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50/40 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {busy ? 'Uploading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => { setError(null); onChange(''); }}
              disabled={disabled || busy}
              className="inline-flex items-center gap-1.5 rounded-control border border-danger-fg/30 px-3 py-1.5 text-xs font-semibold text-danger-fg transition-colors hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled || busy}
          className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong py-6 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary-50/40 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? 'Uploading…' : 'Upload image'}
        </button>
      )}

      <p className="mt-1 text-xs text-text-muted">
        {error ? <span className="font-medium text-danger-fg">{error}</span>
               : 'JPEG, PNG or WEBP. Large photos are resized automatically.'}
      </p>
    </div>
  );
}
