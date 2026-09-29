import { fail, json, withRep } from '@/lib/api';
import { serviceClient } from '@/lib/db/service';
import { checkPhoto, ownPhotoPath } from '@/lib/profile/photo';

const BUCKET = 'avatars';

/**
 * POST /api/profile/photo: the rep's own photo, a square JPEG the browser has
 * already cropped and shrunk. Stored in the public `avatars` bucket (the photo is
 * shown on pages any prospect may open) under the rep's own folder. The old file,
 * if we stored it, is removed.
 */
export const POST = withRep(async (rep, request) => {
  const bytes = new Uint8Array(await request.arrayBuffer());
  const check = checkPhoto(bytes);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400);

  const db = serviceClient();
  const path = `${rep.userId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (uploadError) throw new Error(`photo upload failed: ${uploadError.message}`);

  const { publicUrl } = db.storage.from(BUCKET).getPublicUrl(path).data;
  const prefix = db.storage.from(BUCKET).getPublicUrl('').data.publicUrl;

  const { data: before } = await db
    .from('profiles')
    .select('photo_url')
    .eq('id', rep.userId)
    .maybeSingle();

  const { data: updated, error } = await db
    .from('profiles')
    .update({ photo_url: publicUrl })
    .eq('id', rep.userId)
    .select('id');
  if (error || !updated || updated.length === 0) {
    await db.storage.from(BUCKET).remove([path]);
    return fail('save_your_name_first', 409);
  }

  const old = ownPhotoPath(before?.photo_url ?? null, prefix);
  if (old && old !== path && old.startsWith(`${rep.userId}/`)) {
    await db.storage.from(BUCKET).remove([old]);
  }

  return json({ photo_url: publicUrl });
});

/** DELETE /api/profile/photo: back to initials. */
export const DELETE = withRep(async (rep) => {
  const db = serviceClient();
  const prefix = db.storage.from(BUCKET).getPublicUrl('').data.publicUrl;
  const { data: before } = await db
    .from('profiles')
    .select('photo_url')
    .eq('id', rep.userId)
    .maybeSingle();

  await db.from('profiles').update({ photo_url: null }).eq('id', rep.userId);

  const old = ownPhotoPath(before?.photo_url ?? null, prefix);
  if (old && old.startsWith(`${rep.userId}/`)) await db.storage.from(BUCKET).remove([old]);

  return json({ ok: true });
});
