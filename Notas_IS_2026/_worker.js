const SESSION_COOKIE = "notas_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;
const loginAttempts = new Map();

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64Url(bytes) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", textBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function createSession(secret) {
  const payload = base64Url(textBytes(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), textBytes(payload));
  return `${payload}.${base64Url(new Uint8Array(signature))}`;
}

async function validSession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  try {
    const signatureBytes = base64ToBytes(signature.replaceAll("-", "+").replaceAll("_", "/"));
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(env.SESSION_SECRET), signatureBytes, textBytes(payload));
    if (!valid) return false;
    const payloadBytes = base64ToBytes(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const decoded = JSON.parse(new TextDecoder().decode(payloadBytes));
    return Number.isFinite(decoded.exp) && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function constantTimeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textBytes(String(left))),
    crypto.subtle.digest("SHA-256", textBytes(String(right))),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

function loginRateLimit(request) {
  const key = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((timestamp) => now - timestamp < 10 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}

function clearLoginRateLimit(request) {
  loginAttempts.delete(request.headers.get("CF-Connecting-IP") || "local");
}

function repositoryConfig(env) {
  return {
    api: env.GITHUB_API_URL || "https://api.github.com",
    owner: env.GITHUB_OWNER || "AdrianMiguel99",
    repo: env.GITHUB_REPO || "Notas",
    branch: env.GITHUB_BRANCH || "main",
    path: env.GRADES_PATH || "Notas_IS_2026/data/grades.json",
  };
}

function githubHeaders(env) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "notas-admin",
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

function contentsUrl(env) {
  const config = repositoryConfig(env);
  const path = config.path.split("/").map(encodeURIComponent).join("/");
  return `${config.api}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
}

async function readRepositoryData(env) {
  const config = repositoryConfig(env);
  const response = await fetch(`${contentsUrl(env)}?ref=${encodeURIComponent(config.branch)}`, { headers: githubHeaders(env) });
  if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
  const file = await response.json();
  const decoded = new TextDecoder().decode(base64ToBytes(file.content));
  return { data: JSON.parse(decoded), sha: file.sha };
}

async function writeRepositoryData(env, data, sha, message) {
  const config = repositoryConfig(env);
  return fetch(contentsUrl(env), {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: bytesToBase64(textBytes(`${JSON.stringify(data, null, 2)}\n`)),
      sha,
      branch: config.branch,
    }),
  });
}

async function parseJson(request) {
  if (Number(request.headers.get("Content-Length") || 0) > 4096) throw new Error("Solicitud demasiado grande.");
  try {
    return await request.json();
  } catch {
    throw new Error("Solicitud inválida.");
  }
}

async function login(request, env) {
  if (!sameOrigin(request)) return json({ error: "Solicitud no permitida." }, 403);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) return json({ error: "El acceso administrativo no está configurado." }, 503);
  if (!loginRateLimit(request)) return json({ error: "Demasiados intentos. Probá nuevamente en unos minutos." }, 429);
  let body;
  try {
    body = await parseJson(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const emailMatches = await constantTimeEqual(String(body.email || "").trim().toLowerCase(), env.ADMIN_EMAIL.trim().toLowerCase());
  const passwordMatches = await constantTimeEqual(body.password || "", env.ADMIN_PASSWORD);
  if (!emailMatches || !passwordMatches) return json({ error: "Credenciales incorrectas." }, 401);
  clearLoginRateLimit(request);
  const session = await createSession(env.SESSION_SECRET);
  return json({ authenticated: true }, 200, {
    "Set-Cookie": `${SESSION_COOKIE}=${session}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  });
}

async function addGrade(request, env) {
  if (!sameOrigin(request)) return json({ error: "Solicitud no permitida." }, 403);
  if (!(await validSession(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: "La persistencia no está configurada." }, 503);
  let body;
  try {
    body = await parseJson(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let current;
    try {
      current = await readRepositoryData(env);
    } catch {
      return json({ error: "No fue posible leer las notas guardadas." }, 502);
    }
    const course = current.data.courses.find((candidate) => candidate.id === body.courseId);
    const type = course?.assessmentTypes.find((candidate) => candidate.id === body.typeId);
    const grade = body.grade;
    const min = Number(current.data.gradeScale?.min ?? 0);
    const max = Number(current.data.gradeScale?.max ?? 100);
    if (!course) return json({ error: "Seleccioná una materia válida." }, 400);
    if (!type) return json({ error: "Seleccioná un tipo válido." }, 400);
    if (typeof grade !== "number" || !Number.isFinite(grade) || grade < min || grade > max) {
      return json({ error: `La nota debe estar entre ${min} y ${max}.` }, 400);
    }
    const previous = current.data.evaluations.filter((evaluation) => evaluation.courseId === course.id && evaluation.typeId === type.id);
    if (type.maxEntries && previous.length >= type.maxEntries) return json({ error: "Esa evaluación ya fue registrada." }, 409);
    const name = type.maxEntries === 1 ? type.entryLabel : `${type.entryLabel} ${previous.length + 1}`;
    const evaluation = {
      id: crypto.randomUUID(),
      courseId: course.id,
      typeId: type.id,
      name,
      grade,
      createdAt: new Date().toISOString(),
    };
    current.data.evaluations.push(evaluation);
    let response;
    try {
      response = await writeRepositoryData(env, current.data, current.sha, `chore: add ${name} grade for ${course.id}`);
    } catch {
      return json({ error: "No fue posible guardar la nota." }, 502);
    }
    if (response.ok) return json({ evaluation, data: current.data }, 201);
    if (response.status !== 409 || attempt === 1) return json({ error: "No fue posible guardar la nota." }, 502);
  }
  return json({ error: "No fue posible guardar la nota." }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/config-check" && request.method === "GET") {
      const config = repositoryConfig(env);
      let apiHost = "invalid";
      try {
        apiHost = new URL(config.api).host;
      } catch {}
      return json({
        apiHost,
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        path: config.path,
        tokenConfigured: Boolean(env.GITHUB_TOKEN),
      });
    }
    if (url.pathname === "/api/login" && request.method === "POST") return login(request, env);
    if (url.pathname === "/api/logout" && request.method === "POST") {
      if (!sameOrigin(request)) return json({ error: "Solicitud no permitida." }, 403);
      return json({ authenticated: false }, 200, { "Set-Cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict` });
    }
    if (url.pathname === "/api/session" && request.method === "GET") return json({ authenticated: await validSession(request, env) });
    if (url.pathname === "/api/grades" && request.method === "GET") {
      try {
        const current = await readRepositoryData(env);
        return json(current.data);
      } catch {
        return json({ error: "No fue posible cargar las notas." }, 502);
      }
    }
    if (url.pathname === "/api/grades" && request.method === "POST") return addGrade(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Ruta no encontrada." }, 404);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response(null, { status: 404 });
  },
};
