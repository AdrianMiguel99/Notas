import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateCourse, calculateOverall, evaluationContribution } from "../grades.js";
import worker from "../worker/index.js";

const sourceData = JSON.parse(await readFile(new URL("../data/grades.json", import.meta.url), "utf8"));

test("los rubros repetibles usan el promedio y no multiplican su peso", () => {
  const data = structuredClone(sourceData);
  data.evaluations.push(
    { id: "1", courseId: "CI-0120", typeId: "homework", name: "Tarea 1", grade: 80, createdAt: "2026-08-01T00:00:00.000Z" },
    { id: "2", courseId: "CI-0120", typeId: "homework", name: "Tarea 2", grade: 90, createdAt: "2026-08-02T00:00:00.000Z" },
    { id: "3", courseId: "CI-0120", typeId: "homework", name: "Tarea 3", grade: 70, createdAt: "2026-08-03T00:00:00.000Z" }
  );
  const course = data.courses.find((candidate) => candidate.id === "CI-0120");
  const result = calculateCourse(data, course);
  assert.equal(result.accumulated, 24);
  assert.equal(result.completedWeight, 30);
  assert.equal(result.projected, 80);
  assert.deepEqual(evaluationContribution(data, course, data.evaluations[0]), { weight: 10, contribution: 8 });
});

test("cero cuenta como nota y una evaluación inexistente no cuenta", () => {
  const data = structuredClone(sourceData);
  data.evaluations.push({ id: "1", courseId: "MA-1005", typeId: "midterm-1", name: "Parcial 1", grade: 0, createdAt: "2026-08-01T00:00:00.000Z" });
  const course = data.courses.find((candidate) => candidate.id === "MA-1005");
  assert.deepEqual(calculateCourse(data, course), { accumulated: 0, completedWeight: 20, projected: 0 });
});

test("login, rechazo de credenciales y alta persistente de una nota", async () => {
  const originalFetch = globalThis.fetch;
  let storedData = structuredClone(sourceData);
  let sha = "sha-1";
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method || "GET") === "PUT") {
      const body = JSON.parse(options.body);
      storedData = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      sha = "sha-2";
      return Response.json({ content: { sha } }, { status: 200 });
    }
    return Response.json({ content: Buffer.from(JSON.stringify(storedData)).toString("base64"), sha });
  };

  const env = {
    ADMIN_EMAIL: "admin@example.test",
    ADMIN_PASSWORD: "test-password",
    SESSION_SECRET: "test-session-secret-with-enough-entropy",
    GITHUB_TOKEN: "test-token",
    GITHUB_OWNER: "example",
    GITHUB_REPO: "notas",
    GITHUB_BRANCH: "main",
    GRADES_PATH: "data/grades.json",
  };
  const origin = "https://notas.test";

  try {
    const invalid = await worker.fetch(new Request(`${origin}/api/login`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "invalid" },
      body: JSON.stringify({ email: env.ADMIN_EMAIL, password: "incorrecta" }),
    }), env);
    assert.equal(invalid.status, 401);

    const login = await worker.fetch(new Request(`${origin}/api/login`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "valid" },
      body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
    }), env);
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];
    assert.match(login.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);

    const added = await worker.fetch(new Request(`${origin}/api/grades`, {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: "CI-0120", typeId: "short-test", grade: 85 }),
    }), env);
    assert.equal(added.status, 201);
    const result = await added.json();
    assert.equal(result.evaluation.name, "Prueba corta 1");
    assert.equal(storedData.evaluations.length, 1);
    assert.equal(storedData.evaluations[0].grade, 85);

    const architecture = storedData.courses.find((candidate) => candidate.id === "CI-0120");
    assert.deepEqual(calculateCourse(storedData, architecture), { accumulated: 17, completedWeight: 20, projected: 85 });
    assert.equal(calculateOverall(storedData), 85);
    const artificialIntelligence = storedData.courses.find((candidate) => candidate.id === "CI-0129");
    assert.deepEqual(calculateCourse(storedData, artificialIntelligence), { accumulated: 0, completedWeight: 0, projected: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
