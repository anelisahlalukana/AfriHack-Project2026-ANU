// When a request is completed, apply it to the client record so the dashboard never goes stale.
const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID } = require("../constants/roles");

async function updateClient(clientId, fields) {
  // Clients are public.users rows with role_id 1.
  const { error } = await supabaseAdmin.from("users").update(fields).eq("id", clientId).eq("role_id", CLIENT_ROLE_ID);
  if (error) throw new Error(error.message);
}

// Returns a short sentence describing what changed, or null if nothing did.
async function applyRequestToClient(task, requestType) {
  const form = task.data?.form || {};
  switch (requestType?.apply_action) {
    case "update_address":
      await updateClient(task.client_id, { physical_address: form.new_address });
      return "Client record updated with the new address.";
    case "update_bank_details":
      await updateClient(task.client_id, {
        bank_name: form.bank_name,
        bank_account_number: form.bank_account_number,
        bank_account_type: form.bank_account_type,
      });
      return "Client record updated with the new bank details.";
    case "update_debit_order_day":
      await updateClient(task.client_id, { debit_order_day: form.debit_order_day });
      return `Client record updated: debit order now runs on day ${form.debit_order_day}.`;
    case "add_financial_items": {
      const rows = (form.items || []).map((item) => ({ ...item, client_id: task.client_id }));
      if (!rows.length) return null;
      const { error } = await supabaseAdmin.from("client_financial_items").insert(rows);
      if (error) throw new Error(error.message);
      return `${rows.length} item${rows.length === 1 ? "" : "s"} added to the client's balance sheet.`;
    }
    default:
      return null;
  }
}

module.exports = { applyRequestToClient };
