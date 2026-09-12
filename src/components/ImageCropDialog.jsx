import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Modal } from './Overlays';
import { Button } from './ui';

/**
 * Square crop-and-zoom for a picked image, before it is uploaded.
 *
 * SELF-CONTAINED — no cropper library. A fixed square viewport shows the image
 * at a "cover" fit (so it always fills the frame); the member drags to pan and
 * a slider (or wheel) zooms. On Save the visible square is redrawn to a
 * `OUTPUT`×`OUTPUT` canvas and handed back as a JPEG File, which the upload path
 * then compresses further (see utils/imageUpload). The output is SQUARE; the
 * faint circle is only a guide for how the avatar shows it.
 *
 * The maths in one place: `baseScale` is the cover fit (the image exactly
 * covers the square at zoom 1); `displayScale = baseScale × zoom`. `offset` is
 * the image's top-left in viewport px, clamped so the frame is never uncovered.
 * The crop is the source rectangle the viewport maps to:
 *   srcX = −offset.x / displayScale,  srcSize = VIEWPORT / displayScale.
 *
 * Props:
 *   file       the picked File (null closes the dialog)
 *   onCancel() dismiss without uploading
 *   onCropped(file)  async — receives the cropped JPEG File; the parent uploads
 *                    and closes on success
 *   busy       the parent's upload is in flight
 */

const VIEWPORT = 280; // css px — the on-screen crop frame (fits a phone)
const OUTPUT = 512;   // px — the saved square, ample for an avatar

export default function ImageCropDialog({ file, onCancel, onCropped, busy = false }) {
  const [url, setUrl] = useState(null);
  const [nat, setNat] = useState(null); // { w, h } natural pixels
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  // Load the picked file into an object URL, cleaned up on change/close.
  useEffect(() => {
    if (!file) { setUrl(null); setNat(null); return undefined; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const baseScale = nat ? Math.max(VIEWPORT / nat.w, VIEWPORT / nat.h) : 1;
  const displayScale = baseScale * zoom;
  const dW = nat ? nat.w * displayScale : 0;
  const dH = nat ? nat.h * displayScale : 0;

  // Keep the image covering the frame: offset stays within [VIEWPORT − size, 0].
  const clamp = useCallback((o, dw, dh) => ({
    x: Math.min(0, Math.max(VIEWPORT - dw, o.x)),
    y: Math.min(0, Math.max(VIEWPORT - dh, o.y)),
  }), []);

  // Centre the image the moment its natural size is known.
  const handleLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const bs = Math.max(VIEWPORT / w, VIEWPORT / h);
    setNat({ w, h });
    setZoom(1);
    setOffset({ x: (VIEWPORT - w * bs) / 2, y: (VIEWPORT - h * bs) / 2 });
  };

  // Zoom about the frame centre so the middle of the photo stays put.
  const applyZoom = (next) => {
    if (!nat) return;
    const z = Math.min(4, Math.max(1, next));
    const prevScale = baseScale * zoom;
    const nextScale = baseScale * z;
    const cx = (VIEWPORT / 2 - offset.x) / prevScale;
    const cy = (VIEWPORT / 2 - offset.y) / prevScale;
    setZoom(z);
    setOffset(clamp(
      { x: VIEWPORT / 2 - cx * nextScale, y: VIEWPORT / 2 - cy * nextScale },
      nat.w * nextScale, nat.h * nextScale
    ));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const nx = dragRef.current.ox + (e.clientX - dragRef.current.x);
    const ny = dragRef.current.oy + (e.clientY - dragRef.current.y);
    setOffset(clamp({ x: nx, y: ny }, dW, dH));
  };
  const endDrag = (e) => {
    dragRef.current = null;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };

  const save = async () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      const srcSize = VIEWPORT / displayScale;
      ctx.drawImage(
        img,
        -offset.x / displayScale, -offset.y / displayScale, srcSize, srcSize,
        0, 0, OUTPUT, OUTPUT
      );
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not process the image.');
      const base = (file?.name || 'photo').replace(/\.[^.]+$/, '');
      await onCropped(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
    } finally {
      setSaving(false);
    }
  };

  const working = saving || busy;

  return (
    <Modal
      isOpen={!!file}
      onClose={working ? () => {} : onCancel}
      title="Adjust your photo"
      description="Drag to reposition, and zoom to fit."
      size="sm"
      dismissible={!working}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={working}>Cancel</Button>
          <Button variant="primary" onClick={save} busy={working}>Save photo</Button>
        </>
      }
    >
      <div className="mx-auto" style={{ width: VIEWPORT, maxWidth: '100%' }}>
        <div
          className="relative touch-none select-none overflow-hidden rounded-2xl bg-black/80"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: dragRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={(e) => applyZoom(zoom - e.deltaY * 0.0015)}
        >
          {url && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              ref={imgRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={handleLoad}
              style={{ position: 'absolute', left: offset.x, top: offset.y, width: dW, height: dH, maxWidth: 'none' }}
            />
          )}
          {/* Circular guide — how the avatar will show. The crop itself is the
              square frame; the ring only marks the visible circle. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomIn className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="w-full accent-primary"
          />
        </div>
      </div>
    </Modal>
  );
}
