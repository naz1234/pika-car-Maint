const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 503);

  try {
    const row = await env.DB
      .prepare("SELECT data, updated_at FROM app_state WHERE id = ?")
      .bind("shared")
      .first();

    if (!row) return json({ state: null, updatedAt: 0 });
    return json({ state: JSON.parse(row.data), updatedAt: Number(row.updated_at) });
  } catch (error) {
    return json({ error: "Unable to read shared maintenance data" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 503);

  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json({ error: "Maintenance data is too large" }, 413);

    const payload = JSON.parse(raw);
    const incoming = payload.state;
    const incomingUpdatedAt = Number(payload.updatedAt) || Date.now();

    if (!incoming?.vehicle || !Array.isArray(incoming.items) || !Array.isArray(incoming.history)) {
      return json({ error: "Invalid maintenance data" }, 400);
    }

    const current = await env.DB
      .prepare("SELECT data, updated_at FROM app_state WHERE id = ?")
      .bind("shared")
      .first();

    if (current && Number(current.updated_at) > incomingUpdatedAt) {
      return json({ state: JSON.parse(current.data), updatedAt: Number(current.updated_at) }, 409);
    }

    const data = JSON.stringify(incoming);
    await env.DB
      .prepare(`INSERT INTO app_state (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind("shared", data, incomingUpdatedAt)
      .run();

    return json({ ok: true, updatedAt: incomingUpdatedAt });
  } catch (error) {
    return json({ error: "Unable to save shared maintenance data" }, 500);
  }
}
