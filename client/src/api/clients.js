import { supabase } from '../lib/supabaseClient'
import { http } from './http'
async function result(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}
// The users table holds every role; RLS (client_rows_only) limits advisors to client rows.
export const listClients = () => result(supabase.from('users').select('*, client_financial_items(*), client_goals(*)').order('created_at', { ascending: false }))
export const getClient = id => result(supabase.from('users').select('*, client_dependants(*), client_financial_items(*), client_goals(*)').eq('id', id).single())
export const saveClient = (id, profile, dependants, financialItems, goals) => result(supabase.rpc('save_client_fna', {
  p_id: id || null, p_profile: profile, p_dependants: dependants, p_items: financialItems, p_goals: goals,
}))

// Through the Express API (not RLS): creating a client also creates their login, which needs the service-role key.
export async function addClient(values) {
  const { data } = await http.post('/api/clients', values)
  return data.client
}
// Public step of client registration. Emails the client a verification code.
export async function completeRegistration({ email, idNumber, password }) {
  await http.post('/api/clients/complete-registration', { email, id_number: idNumber, password })
}
// Public: ID-number sign-in for clients. Returns the session tokens to hand to supabase.auth.setSession.
export async function loginClient({ idNumber, password }) {
  const { data } = await http.post('/api/clients/login', { id_number: idNumber, password })
  return data.session
}
// Sends the client's day-one documents. Called right after their email code is verified;
// the server never fails this for the client, it just reports which documents couldn't be sent.
export async function finishRegistration() {
  const { data } = await http.post('/api/clients/finish-registration')
  return data
}
// A signed-in client's own record (null if their login has no client profile). Reads through
// RLS (client_manage_own_row), which only ever returns the row whose auth_user_id is the caller.
export const getOwnClient = authUserId => result(supabase.from('users')
  .select('id, first_name, second_name, surname, id_number, contact_email, contact_mobile, physical_address')
  .eq('auth_user_id', authUserId).maybeSingle())
