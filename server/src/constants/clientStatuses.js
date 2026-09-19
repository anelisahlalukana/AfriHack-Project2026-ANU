// users.status values for a client. New clients start as 'onboarding'; they move to
// 'active' once all 5 compliance documents are signed (see documents.service.js).
const CLIENT_STATUSES = ["onboarding", "active", "inactive"];
const ONBOARDING_STATUS = "onboarding";
const ACTIVE_STATUS = "active";

module.exports = { CLIENT_STATUSES, ONBOARDING_STATUS, ACTIVE_STATUS };
