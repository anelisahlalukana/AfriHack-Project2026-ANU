const path = require("node:path");
const { createStore, demoUsers } = require("./store");
const { createService } = require("./service");
const { createRouter } = require("./router");

// Pass Dev 1's verified server-side identity/directory and Dev 2's consent checker here.
function createDev4({
  demo = false,
  store,
  getUsers,
  resolveUser,
  checkConsent,
  push,
  pushPublicKey,
  now,
} = {}) {
  if (demo && process.env.NODE_ENV === "production")
    throw new Error("Demo identities must not be enabled in production.");
  const dataStore =
    store ||
    createStore(
      path.join(
        __dirname,
        demo ? "../../data/dev4-demo.json" : "../../data/dev4.json",
      ),
    );
  const service = createService({
    store: dataStore,
    getUsers: getUsers || (async () => (demo ? demoUsers : [])),
    checkConsent:
      checkConsent ||
      (demo
        ? async (clientId) => ({
            valid: clientId === "client-thandi",
            expiresAt: "2099-01-01T00:00:00Z",
          })
        : undefined),
    push,
    pushPublicKey,
    now,
  });
  const router = createRouter({
    service,
    resolveUser:
      resolveUser ||
      (async (req) =>
        demo ? demoUsers.find((u) => u.id === req.get("x-demo-user")) : null),
    demoUsers: demo ? demoUsers : [],
  });
  return { router, service, store: dataStore };
}
module.exports = { createDev4 };
