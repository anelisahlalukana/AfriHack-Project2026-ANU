// "Who to contact": the clients behind a report's numbers, so an adviser who reads "4 clients spend
// more than they earn" also gets the four names. A template that can name its clients returns the
// list as `result.contacts`; reports.service.js decides who may see it.
//
// Names live here and only here. The model that writes a report's narrative is given the aggregated
// rows and a bare count (`follow_up`), never this list, so no client name reaches it.
const MAX_CONTACTS = 15;

// `entries` are one per client, already in the order to work through them (the template knows what
// "most urgent" means for its numbers). Returns undefined when there is nobody to contact.
//   title  the list heading            intro  what to do with them, as a sentence
//   order  the sort order in a phrase ("longest wait first"), reused by the templated business reading
function contactList({ title, intro, order, entries }) {
  const seen = new Set();
  const clients = [];
  for (const entry of entries) {
    if (!entry.clientId || seen.has(entry.clientId)) continue;
    seen.add(entry.clientId);
    clients.push({ id: entry.clientId, name: entry.name || "Client", detail: entry.detail });
  }
  if (!clients.length) return undefined;
  return { title, intro, order, total: clients.length, clients: clients.slice(0, MAX_CONTACTS) };
}

// The first few details joined for one client, with a count of the rest ("A; B; and 2 more").
function summarise(parts, max = 2) {
  const shown = parts.slice(0, max).join("; ");
  return parts.length > max ? `${shown}; and ${parts.length - max} more` : shown;
}

module.exports = { contactList, summarise, MAX_CONTACTS };
