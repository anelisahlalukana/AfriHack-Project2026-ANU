import { supabase } from '../lib/supabaseClient'
async function result(request) {
  const { data, error } = await request
  if (error) throw error
  return data
}
export const listClients = () => result(supabase.from('clients').select('*, client_financial_items(*), client_goals(*)').order('created_at', { ascending: false }))
export const getClient = id => result(supabase.from('clients').select('*, client_dependants(*), client_financial_items(*), client_goals(*)').eq('id', id).single())
export const saveClient = (id, profile, dependants, financialItems, goals) => result(supabase.rpc('save_client_fna', {
  p_id: id || null, p_profile: profile, p_dependants: dependants, p_items: financialItems, p_goals: goals,
}))
