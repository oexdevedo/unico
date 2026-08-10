require('dotenv').config();
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=name,whatsapp,contact_status,created_at&order=created_at.desc&limit=5`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  });
  
  const countRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=id`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Prefer': 'count=exact'
    }
  });
  
  const count = countRes.headers.get('content-range');
  const data = await res.json();
  console.log('Total Contacts (Range):', count);
  console.log('Latest 5 Contacts:');
  console.table(data);
}
check();
