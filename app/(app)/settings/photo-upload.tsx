'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { apiSend, apiUpload } from '@/lib/http/client';

const OUTPUT_PX = 720;

/** Crop to the centre square, shrink, and re-encode as JPEG. Also drops EXIF. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();

    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const size = Math.min(side, OUTPUT_PX);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process photos.');

    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;
    context.drawImage(image, sx, sy, side, side, 0, 0, size, size);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo.'))),
        'image/jpeg',
        0.88,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The rep's own photo: take one or choose one on the phone. It is cropped square
 * in the browser and uploaded; no URL to paste.
 */
export function PhotoUpload({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '·';

  async function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const blob = await toSquareJpeg(file);
      try {
        await apiUpload('/api/profile/photo', blob);
      } catch (uploadError) {
        throw new Error(
          uploadError instanceof Error && uploadError.message === 'save_your_name_first'
            ? 'Save your name first, then add a photo.'
            : 'Could not upload that photo. Try another.',
        );
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiSend('/api/profile/photo', 'DELETE');
      router.refresh();
    } catch {
      setError('Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // A plain <img>: the file is one we stored, square and small.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          width={72}
          height={72}
          className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="bg-accent-soft text-accent font-display flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full text-xl font-semibold"
        >
          {initials}
        </span>
      )}

      <div className="min-w-0">
        <p className="text-ink text-[13px] font-semibold">Your photo</p>
        <p className="text-ink-3 mt-0.5 text-[13px] leading-snug">
          A face makes the page read as a person rather than a brochure.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="border-line bg-surface text-ink hover:border-ink-3 inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium disabled:opacity-60"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Working…' : photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          {photoUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="text-ink-3 hover:text-ink-2 text-[13px] underline underline-offset-2"
            >
              Remove
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="text-crit mt-2 text-[13px]" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={onChoose}
      />
    </div>
  );
}
