const PHOTO_KEY = "latest-photo";
const META_KEY = "latest-metadata";
const REQUEST_KEY = "pending-request";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type,x-dashboard-pin"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: jsonHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/status" && request.method === "GET") {
      return getStatus(request, env);
    }

    if (url.pathname === "/api/photo" && request.method === "GET") {
      return getPhoto(env);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return uploadPhoto(request, env);
    }

    if (url.pathname === "/api/request-photo" && request.method === "POST") {
      return requestPhoto(request, env);
    }

    if (url.pathname === "/api/command" && request.method === "GET") {
      return getCommand(env);
    }

    if (url.pathname === "/api/command/complete" && request.method === "POST") {
      return completeCommand(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function getStatus(request, env) {
  const metadata = await readJson(env.PHOTO_STATE, META_KEY);
  const command = await readJson(env.PHOTO_STATE, REQUEST_KEY);
  const url = new URL(request.url);
  const photoUrl = metadata?.uploadedAt
    ? `${url.origin}/api/photo?v=${encodeURIComponent(metadata.uploadedAt)}`
    : null;

  return json({
    hasPhoto: Boolean(metadata),
    photoUrl,
    metadata,
    pendingRequest: command?.status === "pending" ? command : null,
    serverTime: new Date().toISOString()
  });
}

async function getPhoto(env) {
  const object = await env.PHOTO_BUCKET.get(PHOTO_KEY);
  if (!object) {
    return json({ error: "Nog geen foto ontvangen." }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "no-store");
  headers.set("content-type", object.httpMetadata?.contentType || "image/jpeg");
  return new Response(object.body, { headers });
}

async function uploadPhoto(request, env) {
  const auth = request.headers.get("authorization") || "";
  const expected = env.UPLOAD_TOKEN;

  if (!expected || auth !== `Bearer ${expected}`) {
    return json({ error: "Upload token ontbreekt of klopt niet." }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  const maxBytes = Number(env.MAX_UPLOAD_BYTES || 8388608);
  if (contentLength > maxBytes) {
    return json({ error: "Foto is te groot." }, 413);
  }

  const form = await request.formData();
  const photo = form.get("photo");

  if (!photo || typeof photo === "string") {
    return json({ error: "Gebruik multipart/form-data met veld 'photo'." }, 400);
  }

  const metadata = collectMetadata(form);
  const uploadedAt = new Date().toISOString();
  const normalized = {
    ...metadata,
    uploadedAt,
    photo: {
      name: photo.name || "shortcut-photo.jpg",
      type: photo.type || "image/jpeg",
      size: photo.size
    }
  };

  await env.PHOTO_BUCKET.put(PHOTO_KEY, photo.stream(), {
    httpMetadata: {
      contentType: photo.type || "image/jpeg"
    },
    customMetadata: {
      uploadedAt
    }
  });

  await env.PHOTO_STATE.put(META_KEY, JSON.stringify(normalized));
  await env.PHOTO_STATE.delete(REQUEST_KEY);

  return json({ ok: true, metadata: normalized });
}

async function requestPhoto(request, env) {
  const configuredPin = env.DASHBOARD_PIN;
  if (configuredPin) {
    const pin = request.headers.get("x-dashboard-pin") || "";
    if (pin !== configuredPin) {
      return json({ error: "Dashboard PIN klopt niet." }, 401);
    }
  }

  const command = {
    id: crypto.randomUUID(),
    status: "pending",
    requestedAt: new Date().toISOString(),
    note: "PC/web knop heeft een foto-opdracht klaargezet. De iPhone Shortcut moet deze opdracht nog ophalen."
  };

  await env.PHOTO_STATE.put(REQUEST_KEY, JSON.stringify(command), {
    expirationTtl: 3600
  });

  return json({ ok: true, command });
}

async function getCommand(env) {
  const command = await readJson(env.PHOTO_STATE, REQUEST_KEY);
  return json({
    hasCommand: command?.status === "pending",
    command: command?.status === "pending" ? command : null,
    shortcutName: env.SHORTCUT_NAME || "Photo Dashboard Capture"
  });
}

async function completeCommand(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.UPLOAD_TOKEN || auth !== `Bearer ${env.UPLOAD_TOKEN}`) {
    return json({ error: "Upload token ontbreekt of klopt niet." }, 401);
  }

  await env.PHOTO_STATE.delete(REQUEST_KEY);
  return json({ ok: true });
}

function collectMetadata(form) {
  const metadata = {};
  const allowed = [
    "capturedAt",
    "latitude",
    "longitude",
    "altitude",
    "horizontalAccuracy",
    "verticalAccuracy",
    "batteryLevel",
    "batteryState",
    "deviceName",
    "deviceModel",
    "systemVersion",
    "networkType",
    "shortcutVersion",
    "notes"
  ];

  for (const key of allowed) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim() !== "") {
      metadata[key] = value.trim();
    }
  }

  const extra = form.get("extra");
  if (typeof extra === "string" && extra.trim()) {
    try {
      metadata.extra = JSON.parse(extra);
    } catch {
      metadata.extra = extra.trim();
    }
  }

  return metadata;
}

async function readJson(kv, key) {
  const value = await kv.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}
