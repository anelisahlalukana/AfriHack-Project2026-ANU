// A person's display name from a users row. Surname is optional (self-registered clients
// may have one name), so never print "null" or leave a trailing space.
function fullName(row) {
  return [row?.first_name, row?.second_name, row?.surname].filter(Boolean).join(" ");
}

module.exports = { fullName };
