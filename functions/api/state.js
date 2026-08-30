const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value, max, required = false) => typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
const isOptionalText = (value, max) => value == null || isText(value, max);
const isId = value => isText(value, 100, true) && !/[^A-Za-z0-9_-]/.test(value);
const isSafeIcon = value => isOptionalText(value, 32) && (value == null || !/[<>&"']/.test(value));
const isNumber = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
const isNullableNumber = (value, max) => value == null || isNumber(value, max);
const isDate = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const isNullableDate = value => value == null || isDate(value);

export function isValidState(state) {
  if (!isObject(state) || !isObject(state.vehicle) || !Array.isArray(state.items) || !Array.isArray(state.history)) return false;
  const vehicle = state.vehicle;
  if (!isText(vehicle.name, 80) || !isText(vehicle.model, 120) || !isText(vehicle.plate, 32) || !isNumber(vehicle.odometer, 10_000_000)) return false;
  if (state.items.length > 250 || state.history.length > 5_000) return false;

  const itemsValid = state.items.every(item => isObject(item)
    && isId(item.id)
    && isText(item.name, 120, true)
    && isText(item.category, 40, true)
    && isSafeIcon(item.icon)
    && isNumber(item.intervalKm, 1_000_000)
    && isNumber(item.intervalMonths, 1_200)
    && isNullableNumber(item.lastKm, 10_000_000)
    && isNullableDate(item.lastDate));
  if (!itemsValid) return false;

  return state.history.every(record => isObject(record)
    && isId(record.id)
    && isId(record.itemId)
    && isText(record.name, 120, true)
    && isDate(record.date)
    && isNumber(record.mileage, 10_000_000)
    && isNumber(record.cost, 100_000_000)
    && isOptionalText(record.notes, 2_000));
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 503);

  try {
    const row = await env.DB
      .prepare("SELECT data, updated_at FROM app_state WHERE id = ?")
      .bind("shared")
      .first();

    if (!row) return json({ state: null, updatedAt: 0 });
    const state = JSON.parse(row.data);
    if (!isValidState(state)) return json({ error: "Stored maintenance data is invalid" }, 500);
    return json({ state, updatedAt: Number(row.updated_at) });
  } catch (error) {
    return json({ error: "Unable to read shared maintenance data" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "D1 binding DB is not configured" }, 503);

  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return json({ error: "Maintenance data is too large" }, 413);

    let payload;
    try { payload = JSON.parse(raw); }
    catch { return json({ error: "Invalid maintenance data" }, 400); }
    const incoming = payload?.state;
    const incomingUpdatedAt = Number(payload?.updatedAt);

    if (!isValidState(incoming) || !Number.isSafeInteger(incomingUpdatedAt) || incomingUpdatedAt < 0) {
      return json({ error: "Invalid maintenance data" }, 400);
    }

    const current = await env.DB
      .prepare("SELECT data, updated_at FROM app_state WHERE id = ?")
      .bind("shared")
      .first();

    const currentUpdatedAt = Number(current?.updated_at) || 0;
    if (current && currentUpdatedAt >= incomingUpdatedAt) {
      const state = JSON.parse(current.data);
      if (!isValidState(state)) return json({ error: "Stored maintenance data is invalid" }, 500);
      return json({ state, updatedAt: Number(current.updated_at) }, 409);
    }

    const data = JSON.stringify(incoming);
    const updatedAt = Math.max(Date.now(), currentUpdatedAt + 1);
    await env.DB
      .prepare(`INSERT INTO app_state (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .bind("shared", data, updatedAt)
      .run();

    return json({ ok: true, updatedAt });
  } catch (error) {
    return json({ error: "Unable to save shared maintenance data" }, 500);
  }
}
