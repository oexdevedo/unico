require('dotenv').config();
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/contacts?select=non_existent_column`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  });
  const data = await res.json();
  console.log('Response:', data);
}
check();
