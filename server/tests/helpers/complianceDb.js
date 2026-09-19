// In-memory query fake for service/HTTP contracts, not a substitute for PostgreSQL tests.
function fakeDatabase(initial = {}, users = {}) {
  const tables = structuredClone(initial);
  const failures = {};
  const calls = [];
  const db = {
    tables, failures, calls,
    auth: {
      getUser: async token => ({ data: { user: users[token] || null }, error: null }),
      admin: { getUserById: async id => ({ data: { user: Object.values(users).find(u => u.id === id) || null }, error: null }) },
    },
    from(table) {
      const filters = [], order = [];
      let offset = 0, limit = Infinity, single = false, insert, update;
      const q = {
        select() { return q; },
        eq(key, value) { filters.push(row => row[key] === value); return q; },
        order(key, options = {}) { order.push([key, options.ascending !== false]); return q; },
        limit(value) { limit = value; return q; },
        range(start, end) { offset = start; limit = Math.min(end - start + 1, db.pageCap || Infinity); return q; },
        maybeSingle() { single = true; return q; },
        single() { single = true; return q; },
        insert(value) { insert = value; return q; },
        upsert(value) { insert = value; return q; },
        update(value) { update = value; return q; },
        async then(resolve, reject) {
          try {
            calls.push({ table, insert, update });
            if (failures[table]) return resolve({ data: null, error: failures[table] });
            let rows = (tables[table] || []).filter(row => filters.every(match => match(row)));
            if (insert) {
              const row = { id: `row-${calls.length}`, ...insert };
              (tables[table] ||= []).push(row); rows = [row];
            }
            if (update) rows.forEach(row => Object.assign(row, update));
            rows = [...rows].sort((a, b) => {
              for (const [key, asc] of order) {
                const compared = String(a[key]).localeCompare(String(b[key]));
                if (compared) return asc ? compared : -compared;
              }
              return 0;
            }).slice(offset, offset + limit);
            resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null });
          } catch (error) { reject(error); }
        },
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (failures.rpc) return { data: null, error: failures.rpc };
      return { data: { id: "rpc-record", ...args.p_values, created_at: "2026-09-19T10:00:00Z" }, error: null };
    },
  };
  return db;
}
module.exports = { fakeDatabase };
