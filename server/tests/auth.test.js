const test = require("node:test");
const assert = require("node:assert/strict");

// Stub the Supabase admin client at the config boundary: getUser() resolves tokens from this table.
const sessions = {
  "advisor-token": { id: "u-advisor", app_metadata: { role: "advisor" } },
  "client-token": { id: "u-client", app_metadata: {} },
};
let getUserCalls = [];
const config = require.resolve("../src/config/supabaseClient");
require.cache[config] = {
  id: config,
  filename: config,
  loaded: true,
  exports: {
    supabaseAdmin: {
      auth: {
        async getUser(token) {
          getUserCalls.push(token);
          const user = sessions[token];
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
        },
      },
    },
  },
};
const { requireAuth, requireRole } = require("../src/middleware/auth");

function call(middleware, req) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.code = code;
        return this;
      },
      json(body) {
        resolve({ status: this.code, body, next: false, req });
      },
    };
    Promise.resolve(middleware(req, res, () => resolve({ next: true, req }))).catch((error) => resolve({ error }));
  });
}

test("requireAuth rejects a missing or malformed Authorization header without calling Supabase", async () => {
  getUserCalls = [];
  for (const headers of [{}, { authorization: "" }, { authorization: "advisor-token" }, { authorization: "Basic advisor-token" }, { authorization: "Bearer" }]) {
    const out = await call(requireAuth, { headers });
    assert.equal(out.status, 401, JSON.stringify(headers));
    assert.match(out.body.error, /Missing or malformed/);
  }
  assert.deepEqual(getUserCalls, []);
});

test("requireAuth rejects tokens Supabase does not accept", async () => {
  const out = await call(requireAuth, { headers: { authorization: "Bearer forged-token" } });
  assert.equal(out.status, 401);
  assert.match(out.body.error, /Invalid or expired/);
});

test("requireAuth attaches the verified user and continues", async () => {
  const out = await call(requireAuth, { headers: { authorization: "Bearer advisor-token" } });
  assert.equal(out.next, true);
  assert.equal(out.req.user.id, "u-advisor");
});

test("requireRole allows only the listed app_metadata roles", async () => {
  const guard = requireRole(["advisor", "admin"]);
  assert.equal((await call(guard, { user: sessions["advisor-token"] })).next, true);

  for (const user of [sessions["client-token"], undefined, { app_metadata: { role: "provider" } }]) {
    const out = await call(guard, { user });
    assert.equal(out.status, 403);
    assert.match(out.body.error, /insufficient role/);
  }
});

test("requireRole ignores a role claimed in user-editable metadata", async () => {
  const out = await call(requireRole(["admin"]), { user: { app_metadata: {}, user_metadata: { role: "admin" } } });
  assert.equal(out.status, 403);
});
