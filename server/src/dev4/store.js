const fs = require("node:fs");
const path = require("node:path");

const demoUsers = [
  { id: "adviser-qiniso", role: "adviser", name: "Qiniso · Adviser" },
  { id: "adviser-vusi", role: "adviser", name: "Vusi · Adviser" },
  {
    id: "client-thandi",
    clientId: "client-thandi",
    role: "client",
    name: "Thandi Mokoena",
  },
  {
    id: "client-sipho",
    clientId: "client-sipho",
    role: "client",
    name: "Sipho Dlamini",
  },
];
const initialRules = [
  ["valuation", "Insurance valuation certificate", 24, "both"],
  ["licence", "Driving licence expiry", 0, "client"],
  ["annual-review", "Annual review meeting", 12, "both"],
  ["retirement-fee", "Retirement fee renewal", 12, "adviser"],
  ["birthday", "Birthday", 12, "both"],
  ["anniversary", "Anniversary", 12, "client"],
].map(([id, title, repeatMonths, audience]) => ({
  id,
  title,
  repeatMonths,
  audience,
  enabled: true,
}));

function createStore(file) {
  let data =
    file && fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : {
          rules: initialRules,
          reminders: [],
          notifications: [],
          messages: [],
          subscriptions: [],
          snapshots: [],
        };
  return {
    get data() {
      return data;
    },
    transaction(fn) {
      const draft = structuredClone(data);
      const result = fn(draft);
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(draft, null, 2));
        fs.renameSync(`${file}.tmp`, file);
      }
      data = draft;
      return result;
    },
  };
}
module.exports = { createStore, demoUsers };
