const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max + 1) : '';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const name = clean(body.name, 100);
  const email = clean(body.email, 254);
  const company = clean(body.company, 120);
  const reps = clean(body.reps, 4);
  const bad =
    !name ||
    name.length > 100 ||
    !EMAIL.test(email) ||
    email.length > 254 ||
    !company ||
    company.length > 120 ||
    (reps !== '' && !/^\d{1,4}$/.test(reps));
  if (bad) return Response.json({ ok: false, error: 'invalid_input' }, { status: 400 });

  // storage not wired: needs Zaid's decision on where this data goes. Nothing is stored or sent.
  return Response.json({ ok: true });
}
