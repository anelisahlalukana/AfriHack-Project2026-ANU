// Shape of the audit log feed. Kept apart from the service so the validators and
// the tests agree on what is allowed without importing Supabase.

// The three activity sources unioned by public.audit_events.
const SOURCES = ["compliance", "task", "provider"];

// Columns a caller may sort by. Anything else is rejected rather than silently
// ignored, so a typo in a query string never returns a differently ordered page.
const SORTABLE = {
  occurredAt: "occurred_at",
  source: "source",
  category: "category",
  summary: "summary",
  result: "result",
  actorName: "actor_name",
  actorType: "actor_type",
  clientName: "client_name",
  providerName: "provider_name",
  taskReference: "task_reference",
};

const DEFAULT_SORT = "occurredAt";
const DEFAULT_DIRECTION = "desc";

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// A download pulls the whole filtered set rather than the current page. The cap
// stops one request from trying to stream an unbounded table into memory.
const EXPORT_MAX_ROWS = 10000;

// The filter dropdowns are built by scanning recent rows for the values actually
// present. PostgREST cannot do a DISTINCT, so this is a bounded scan rather than an
// unbounded one; free-text search still reaches anything older than the window.
const FACET_SCAN_ROWS = 2000;

module.exports = {
  SOURCES,
  SORTABLE,
  DEFAULT_SORT,
  DEFAULT_DIRECTION,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  EXPORT_MAX_ROWS,
  FACET_SCAN_ROWS,
};
