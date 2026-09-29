import { describe, expect, it } from 'vitest';
import { checkPhoto, isJpeg, MAX_PHOTO_BYTES, ownPhotoPath } from '@/lib/profile/photo';

const jpeg = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

describe('profile photo checks', () => {
  it('accepts a small JPEG', () => {
    expect(checkPhoto(jpeg(50_000))).toEqual({ ok: true });
  });

  it('refuses empty, oversized and non-JPEG bodies', () => {
    expect(checkPhoto(new Uint8Array())).toEqual({ ok: false, error: 'empty' });
    expect(checkPhoto(jpeg(MAX_PHOTO_BYTES + 1))).toEqual({ ok: false, error: 'too_large' });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkPhoto(png)).toEqual({ ok: false, error: 'not_jpeg' });
    expect(isJpeg(new TextEncoder().encode('<svg onload=alert(1)>'))).toBe(false);
  });

  it('only treats URLs under our bucket prefix as our own files', () => {
    const prefix = 'https://x.supabase.co/storage/v1/object/public/avatars/';
    expect(ownPhotoPath(`${prefix}u1/a.jpg?t=1`, prefix)).toBe('u1/a.jpg');
    expect(ownPhotoPath('https://evil.example/u1/a.jpg', prefix)).toBeNull();
    expect(ownPhotoPath(null, prefix)).toBeNull();
  });
});
