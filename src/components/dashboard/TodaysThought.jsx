import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTodaysThoughtImage, useToast } from '../../hooks';
import { saveRemoteImage, shareRemoteImageOnWhatsApp } from '../../utils/saveImage';
import WhatsAppIcon from '../WhatsAppIcon';

/**
 * TODAY'S THOUGHT — the spiritual quote at the top of My Dashboard.
 *
 * NOW A PRE-RENDERED IMAGE, NOT A LIVE CARD. The card (gradient + logos + text)
 * is rendered to a PNG on the server — once per quote, by the midnight scheduler
 * or an admin — and this component just displays that finished file and shares
 * it. That deletes the whole in-browser html-to-image capture, which used to
 * drop the header logos when a phone built the share image
 * (`backend/app/services/thought_image_service.py`, `GET /thoughts/today-image`).
 *
 * Backed by `useTodaysThoughtImage()`: a random pick among today's images, else
 * the last available, else `null`. On `null` the card renders nothing (an empty
 * store, or a day the scheduler had no unused quote left) rather than an empty
 * ornament box.
 */

export default function TodaysThought() {
  const query = useTodaysThoughtImage();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Which image the Download / Share buttons act on. Defaults to landscape;
  // the toggle only appears when a portrait render also exists (older records,
  // generated before portrait, have only the landscape image).
  const [orientation, setOrientation] = useState('landscape');

  const data = query.data;
  const landscapeUrl = data?.image_url;
  const portraitUrl = data?.image_url_portrait;
  const hasPortrait = Boolean(portraitUrl);
  // Fall back to landscape if portrait is somehow selected but absent.
  const showPortrait = orientation === 'portrait' && hasPortrait;
  const imageUrl = showPortrait ? portraitUrl : landscapeUrl;

  // Nothing to show — empty store, or no image generated yet and none prior.
  if (!landscapeUrl) return null;

  const name = `Todays-Thought-${showPortrait ? 'Portrait' : 'Landscape'}.png`;

  const downloadImage = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await saveRemoteImage(imageUrl, name);
      if (res.ok) toast.info(res.mode === 'share' ? 'Image ready to share.' : 'Image downloaded.');
      else if (res.reason !== 'cancelled') toast.error(res.reason || 'Could not download the image.');
    } finally {
      setBusy(false);
    }
  };

  const shareWhatsApp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await shareRemoteImageOnWhatsApp(imageUrl, name);
      if (!res.ok) {
        if (res.reason !== 'cancelled') toast.error(res.reason || 'Could not share the image.');
      } else if (res.mode === 'clipboard') {
        toast.info('Image copied — choose a WhatsApp chat and paste it.');
      } else if (res.mode === 'fallback') {
        toast.info('Image saved — open WhatsApp and attach it.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/*
        The whole card is the rendered PNG (`alt` carries the quote so a screen
        reader reads the thought). A Landscape / Portrait toggle (shown only when
        both renders exist) switches the preview; the Download / Share controls
        below act on whichever orientation is selected. Controls sit BELOW the
        image — overlaying them covered the quote on a phone.
      */}
      <div className="panel overflow-hidden !p-0">
        {hasPortrait && (
          <div className="flex justify-center pt-4">
            <div className="inline-flex rounded-full bg-gray-100 p-1" role="tablist" aria-label="Image orientation">
              {[
                { key: 'landscape', label: 'Landscape' },
                { key: 'portrait', label: 'Portrait' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={orientation === key}
                  onClick={() => setOrientation(key)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    orientation === key
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-center px-4 py-4">
          <img
            src={imageUrl}
            alt={data?.text || "Today's Thought"}
            className={
              showPortrait
                ? 'mx-auto block h-auto max-h-[70vh] w-auto rounded-lg'
                : 'block h-auto w-full rounded-lg'
            }
            loading="eager"
          />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-4">
          <button
            type="button"
            onClick={downloadImage}
            disabled={busy}
            aria-label="Download today's thought image"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          >
            <Download className="h-4 w-4" />
            <span>Download</span>
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            disabled={busy}
            aria-label="Share today's thought on WhatsApp"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          >
            <WhatsAppIcon className="h-4 w-4" />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}
