/**
 * GET /api/events/[id]/export — legacy URL kept for old links and bookmarks.
 * Permanently redirects to GET /api/contacts/export?event=<id>. No auth here:
 * the target route enforces auth and ownership.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const target = new URL(`/api/contacts/export?event=${encodeURIComponent(id)}`, request.url);
  return Response.redirect(target, 308);
}
