const test = require("node:test");
const assert = require("node:assert/strict");
const wf = require("../src/utils/workflow");

const motor = [
  { stage_key: "claim_registered", step_order: 1, actor: "provider" },
  { stage_key: "vehicle_assessment", step_order: 2, actor: "client", requires_client_action: true, client_action_kind: "confirm" },
  { stage_key: "assessment_submitted", step_order: 3, actor: "provider" },
  { stage_key: "repair_quotes", step_order: 4, actor: "adviser" },
  { stage_key: "repair_in_progress", step_order: 8, actor: "provider", repeatable: true },
  { stage_key: "hire_car_returned", step_order: 9, actor: "adviser" },
  { stage_key: "closed", step_order: 10, actor: "client", requires_client_action: true, client_action_kind: "review", is_terminal: true, outcome: "completed" },
  { stage_key: "declined", step_order: 100, actor: "provider", is_terminal: true, outcome: "declined" },
];

test("main steps exclude the declined outcome and keep order", () => {
  assert.deepEqual(wf.mainSteps(motor).map((s) => s.stage_key).at(-1), "closed");
  assert.equal(wf.mainSteps(motor).length, 7);
});

test("next stage follows step order and starts at the first step", () => {
  assert.equal(wf.nextStage(motor, null).stage_key, "claim_registered");
  assert.equal(wf.nextStage(motor, "vehicle_assessment").stage_key, "assessment_submitted");
  assert.equal(wf.nextStage(motor, "closed"), null);
});

test("status follows the stage", () => {
  assert.equal(wf.statusForStage(motor[1]), "awaiting_client");
  assert.equal(wf.statusForStage(motor[3]), "open");
  assert.equal(wf.statusForStage(motor.at(-1)), "declined");
  assert.equal(wf.statusForStage({ is_terminal: true, outcome: "completed" }), "completed");
  // Claim close needs the client's review, so it waits on them.
  assert.equal(wf.statusForStage(motor[6]), "awaiting_client");
});

test("progress counts steps and handles declined", () => {
  assert.deepEqual(wf.progress(motor, "repair_quotes", "open"), { step: 4, total: 7, percent: 57, declined: false });
  assert.equal(wf.progress(motor, "closed", "completed").percent, 100);
  assert.equal(wf.progress(motor, "declined", "declined").declined, true);
});

test("waiting on: client, insurer or Royal Square", () => {
  assert.equal(wf.waitingOn({ status: "awaiting_client", current_stage: "vehicle_assessment" }, motor), "client");
  assert.equal(wf.waitingOn({ status: "open", current_stage: "vehicle_assessment" }, motor), "provider");
  assert.equal(wf.waitingOn({ status: "open", current_stage: "assessment_submitted" }, motor), "us");
  assert.equal(wf.waitingOn({ status: "open", current_stage: "repair_in_progress" }, motor), "provider");
  assert.equal(wf.waitingOn({ status: "open", current_stage: null, task_type: "claim" }, motor), "provider");
  assert.equal(wf.waitingOn({ status: "completed", current_stage: "closed" }, motor), null);
});

test("overdue only when waiting on us for more than 48 hours", () => {
  const old = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
  const recent = new Date().toISOString();
  assert.equal(wf.isOverdue({ status: "open", current_stage: "assessment_submitted", updated_at: old }, motor), true);
  assert.equal(wf.isOverdue({ status: "open", current_stage: "assessment_submitted", updated_at: recent }, motor), false);
  assert.equal(wf.isOverdue({ status: "awaiting_client", current_stage: "vehicle_assessment", updated_at: old }, motor), false);
});

test("form validation uses the configured fields", () => {
  const fields = [
    { key: "incident_at", label: "When", type: "datetime", required: true },
    { key: "vehicle_use", label: "Use", type: "select", required: true, options: ["Personal", "Business"] },
    { key: "police_notified", label: "Police", type: "boolean" },
    { key: "amount", label: "Amount", type: "number" },
  ];
  const clean = wf.validateForm(fields, { incident_at: "2026-09-15T10:00", vehicle_use: "Personal", police_notified: "true", extra: "dropped" });
  assert.deepEqual(clean, { incident_at: "2026-09-15T10:00", vehicle_use: "Personal", police_notified: true });
  assert.throws(() => wf.validateForm(fields, { vehicle_use: "Personal" }), /Please complete: When/);
  assert.throws(() => wf.validateForm(fields, { incident_at: "2026-09-15", vehicle_use: "Boat" }), /choose one of/);
  assert.throws(() => wf.validateForm(fields, { incident_at: "2026-09-15", vehicle_use: "Personal", amount: -1 }), /negative/);
  assert.throws(() => wf.validateForm(fields, { incident_at: "2999-01-01", vehicle_use: "Personal" }), /past/);
});

test("request rules: debit order day and financial items", () => {
  const dayField = [{ key: "debit_order_day", label: "Day", type: "number", required: true }];
  assert.throws(() => wf.validateForm(dayField, { debit_order_day: 32 }), /1 to 31/);
  assert.equal(wf.validateForm(dayField, { debit_order_day: "25" }).debit_order_day, 25);
  const items = [{ key: "items", label: "Items", type: "financial_items", required: true }];
  assert.throws(() => wf.validateForm(items, { items: [] }), /Please complete/);
  assert.throws(() => wf.validateForm(items, { items: [{ category: "car", item_type: "x", amount: 1 }] }), /asset, liability/);
  assert.equal(wf.validateForm(items, { items: [{ category: "asset", item_type: "Car", amount: "150000" }] }).items[0].amount, 150000);
});

test("document pack reports received and missing documents", () => {
  const pack = wf.documentPack(
    [{ key: "a", label: "A", required: true }, { key: "b", label: "B", required: true }, { key: "c", label: "C", required: false }],
    [{ document_key: "a" }, { document_key: "c" }]
  );
  assert.equal(pack.receivedRequired, 1);
  assert.equal(pack.totalRequired, 2);
  assert.equal(pack.complete, false);
});

test("the provider can act only on its own open steps", () => {
  const at = (current_stage, status = "open") => ({ current_stage, status });
  // After the client confirms the assessment, the insurer submits it.
  assert.deepEqual(
    [wf.providerAction(at("vehicle_assessment"), motor).kind, wf.providerAction(at("vehicle_assessment"), motor).stage.stage_key],
    ["advance", "assessment_submitted"]
  );
  // Repairs repeat weekly: the insurer posts updates; the adviser moves the claim on.
  assert.equal(wf.providerAction(at("repair_in_progress"), motor).kind, "update");
  // Waiting on the client, with Royal Square, or closed: nothing to do.
  assert.equal(wf.providerAction(at("vehicle_assessment", "awaiting_client"), motor), null);
  assert.equal(wf.providerAction(at("assessment_submitted"), motor), null);
  assert.equal(wf.providerAction(at("closed", "completed"), motor), null);
  assert.equal(wf.providerAction(at("claim_registered", "draft"), motor), null);
});
