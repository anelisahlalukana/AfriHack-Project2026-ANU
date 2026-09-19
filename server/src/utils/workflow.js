// Pure workflow rules (no database access) so they can be unit-tested.
const { OVERDUE_AFTER_HOURS, CLOSED_STATUSES } = require("../constants/taskConfig");
const { badRequest } = require("./httpError");

// The steps a task normally moves through, in order (the declined outcome is excluded).
function mainSteps(stages = []) {
  return stages
    .filter((s) => s.outcome !== "declined")
    .sort((a, b) => a.step_order - b.step_order);
}

function findStage(stages = [], key) {
  return stages.find((s) => s.stage_key === key) || null;
}

function nextStage(stages, currentKey) {
  const steps = mainSteps(stages);
  if (!currentKey) return steps[0] || null;
  const index = steps.findIndex((s) => s.stage_key === currentKey);
  return index >= 0 ? steps[index + 1] || null : null;
}

function declinedStage(stages = []) {
  return stages.find((s) => s.outcome === "declined") || null;
}

function completedStage(stages = []) {
  return mainSteps(stages).find((s) => s.is_terminal && s.outcome === "completed") || null;
}

// Status a task should have once it arrives at a stage.
function statusForStage(stage) {
  if (stage.outcome === "declined") return "declined";
  if (stage.requires_client_action) return "awaiting_client";
  if (stage.is_terminal && stage.outcome === "completed") return "completed";
  return "open";
}

// "Step 6 of 10" style progress for a task.
function progress(stages, currentKey, status) {
  const steps = mainSteps(stages);
  const total = steps.length;
  if (status === "declined") return { step: null, total, percent: 100, declined: true };
  const index = steps.findIndex((s) => s.stage_key === currentKey);
  const step = index >= 0 ? index + 1 : 0;
  const done = status === "completed" ? total : Math.max(0, step - (status === "awaiting_client" ? 1 : 0));
  return { step, total, percent: total ? Math.round((done / total) * 100) : 0, declined: false };
}

// Who the task is waiting on right now: the client, the insurer/provider, or Royal Square ("us").
function waitingOn(task, stages) {
  if (task.status === "draft") return "client";
  if (CLOSED_STATUSES.includes(task.status)) return null;
  if (task.status === "awaiting_client") return "client";
  const current = findStage(stages, task.current_stage);
  if (!current) return task.task_type === "claim" ? "provider" : "us";
  if (current.repeatable && current.actor === "provider") return "provider";
  const next = nextStage(stages, task.current_stage);
  if (!next) return "us";
  return next.actor === "provider" ? "provider" : "us";
}

// What the product provider can do on a task right now: complete its next step
// ("advance"), post a repeating progress update ("update"), or nothing (null) while
// the task is with the client or Royal Square, or closed.
function providerAction(task, stages) {
  if (task.status !== "open") return null;
  const current = findStage(stages, task.current_stage);
  const next = nextStage(stages, task.current_stage);
  if (next && next.actor === "provider") return { kind: "advance", stage: next };
  if (current?.repeatable && current.actor === "provider") return { kind: "update", stage: current };
  return null;
}

function isOverdue(task, stages, now = Date.now()) {
  if (waitingOn(task, stages) !== "us") return false;
  const updated = new Date(task.updated_at || task.created_at).getTime();
  return now - updated > OVERDUE_AFTER_HOURS * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Form validation driven by the form_fields config.
// ---------------------------------------------------------------------------
function isBlank(value) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

const FINANCIAL_CATEGORIES = ["asset", "liability", "income", "expense"];

function validateFinancialItems(items, label) {
  if (!Array.isArray(items)) throw badRequest(`${label} must be a list`);
  if (items.length > 50) throw badRequest(`${label} can have at most 50 rows`);
  return items.map((item, i) => {
    const row = `${label} row ${i + 1}`;
    if (!FINANCIAL_CATEGORIES.includes(item?.category)) throw badRequest(`${row}: choose asset, liability, income or expense`);
    if (isBlank(item.item_type)) throw badRequest(`${row}: describe the item`);
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest(`${row}: enter an amount of 0 or more`);
    return {
      category: item.category,
      item_type: String(item.item_type).trim().slice(0, 120),
      description: isBlank(item.description) ? null : String(item.description).trim().slice(0, 500),
      amount,
      frequency: isBlank(item.frequency) ? null : String(item.frequency).slice(0, 20),
    };
  });
}

// Returns a cleaned copy of formData containing only configured fields.
function validateForm(fields = [], formData = {}) {
  if (formData === null || typeof formData !== "object" || Array.isArray(formData)) {
    throw badRequest("Form data must be an object");
  }
  const clean = {};
  const missing = [];

  for (const field of fields) {
    const raw = formData[field.key];
    if (isBlank(raw) || (field.type === "financial_items" && Array.isArray(raw) && raw.length === 0)) {
      if (field.required && field.type !== "boolean") missing.push(field.label);
      continue;
    }

    switch (field.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw badRequest(`${field.label} must be a number`);
        if (n < 0) throw badRequest(`${field.label} cannot be negative`);
        clean[field.key] = n;
        break;
      }
      case "date":
      case "datetime": {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) throw badRequest(`${field.label} is not a valid date`);
        clean[field.key] = String(raw);
        break;
      }
      case "boolean":
        clean[field.key] = raw === true || raw === "true";
        break;
      case "select":
        if (Array.isArray(field.options) && !field.options.includes(raw)) {
          throw badRequest(`${field.label}: choose one of ${field.options.join(", ")}`);
        }
        clean[field.key] = raw;
        break;
      case "financial_items":
        clean[field.key] = validateFinancialItems(raw, field.label);
        break;
      default:
        clean[field.key] = String(raw).trim().slice(0, field.type === "textarea" ? 4000 : 500);
    }
  }

  if (missing.length) throw badRequest(`Please complete: ${missing.join(", ")}`, { missing });

  // Field-specific rules the generic types can't express.
  if (clean.debit_order_day !== undefined) {
    if (!Number.isInteger(clean.debit_order_day) || clean.debit_order_day < 1 || clean.debit_order_day > 31) {
      throw badRequest("Debit order day must be a whole number from 1 to 31");
    }
  }
  if (clean.percentage !== undefined && clean.percentage > 100) {
    throw badRequest("A beneficiary share cannot be more than 100%");
  }
  for (const key of ["incident_at", "date_of_death", "treatment_date"]) {
    if (clean[key] && new Date(clean[key]).getTime() > Date.now() + 60 * 1000) {
      throw badRequest("A date in the past is required for when it happened");
    }
  }

  return clean;
}

// Claim pack: which configured documents have at least one file.
function documentPack(requiredDocuments = [], files = []) {
  const items = requiredDocuments.map((doc) => {
    const count = files.filter((f) => f.document_key === doc.key).length;
    return { key: doc.key, label: doc.label, required: Boolean(doc.required), received: count > 0, count };
  });
  const required = items.filter((i) => i.required);
  return {
    items,
    receivedRequired: required.filter((i) => i.received).length,
    totalRequired: required.length,
    complete: required.every((i) => i.received),
  };
}

module.exports = {
  mainSteps,
  findStage,
  nextStage,
  declinedStage,
  completedStage,
  statusForStage,
  progress,
  waitingOn,
  providerAction,
  isOverdue,
  validateForm,
  validateFinancialItems,
  documentPack,
};
