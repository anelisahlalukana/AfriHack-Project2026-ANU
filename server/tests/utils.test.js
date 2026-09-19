const test = require("node:test");
const assert = require("node:assert/strict");
const { HttpError, badRequest, forbidden, notFound, conflict, assertUuid } = require("../src/utils/httpError");
const { escapeHtml } = require("../src/utils/escapeHtml");
const { fullName } = require("../src/utils/fullName");

test("HTTP error helpers carry the status the API should answer with", () => {
  const cases = [
    [badRequest("bad", { field: "x" }), 400],
    [forbidden(), 403],
    [notFound(), 404],
    [conflict("clash"), 409],
  ];
  for (const [error, status] of cases) {
    assert.ok(error instanceof HttpError);
    assert.ok(error instanceof Error);
    assert.equal(error.status, status);
  }
  assert.deepEqual(badRequest("bad", { field: "x" }).details, { field: "x" });
  assert.match(forbidden().message, /do not have access/);
  assert.equal(notFound("No such claim").message, "No such claim");
});

test("assertUuid returns valid ids and rejects everything else with a 400", () => {
  const id = "3f2b8a4e-1c5d-4e6f-9a7b-0c1d2e3f4a5b";
  assert.equal(assertUuid(id), id);
  assert.equal(assertUuid(id.toUpperCase()), id.toUpperCase());
  for (const bad of ["", "not-a-uuid", `${id}0`, `x${id}`, null, undefined, 42, {}]) {
    assert.throws(() => assertUuid(bad, "clientId"), (error) => error.status === 400 && /Invalid clientId/.test(error.message));
  }
});

test("escapeHtml neutralises markup in text that goes into emails", () => {
  assert.equal(escapeHtml(`<script>alert("x") & 'y'</script>`), "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;");
  assert.equal(escapeHtml("plain text"), "plain text");
  assert.equal(escapeHtml(42), "42");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;", "already-escaped input is escaped again, never trusted");
});

test("fullName joins the names that exist and never prints null or stray spaces", () => {
  assert.equal(fullName({ first_name: "Thabo", second_name: "Sipho", surname: "Mokoena" }), "Thabo Sipho Mokoena");
  assert.equal(fullName({ first_name: "Thabo", second_name: null, surname: "Mokoena" }), "Thabo Mokoena");
  assert.equal(fullName({ first_name: "Thabo", surname: null }), "Thabo");
  assert.equal(fullName({}), "");
  assert.equal(fullName(null), "");
  assert.equal(fullName(undefined), "");
});
