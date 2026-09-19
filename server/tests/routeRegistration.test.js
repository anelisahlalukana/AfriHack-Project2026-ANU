const test = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync } = require("node:fs");
const path = require("node:path");

test("every route module registers without a missing middleware or controller", () => {
  const directory = path.join(__dirname, "../src/routes");
  for (const file of readdirSync(directory).filter(name => name.endsWith(".routes.js"))) {
    assert.doesNotThrow(() => require(path.join(directory, file)), file);
  }
});

test("provider message and handler validators reject blank input and accept valid values", () => {
  const { validateProviderMessagePayload, validateHandlerPayload } = require("../src/middleware/validate");
  for (const [validate, field] of [[validateProviderMessagePayload, "note"], [validateHandlerPayload, "name"]]) {
    for (const value of [undefined, "  ", 123, "x".repeat(2001)]) {
      let status, body, nextCalled = false;
      const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
      validate({ body: { [field]: value } }, res, () => { nextCalled = true; });
      assert.equal(status, 400);
      assert.equal(typeof body.error, "string");
      assert.equal(nextCalled, false);
    }
    let passed = false;
    validate({ body: { [field]: "Valid message or name" } }, {}, () => { passed = true; });
    assert.equal(passed, true);
  }
});
