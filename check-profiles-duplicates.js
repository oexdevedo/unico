require('dotenv').config();
async function check() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/profiles?select=user_id`, {
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  });
  const data = await res.json();
  const userIds = data.map(d => d.user_id);
  const uniqueUserIds = new Set(userIds);
  console.log('Total Profiles:', userIds.length);
  console.log('Unique User IDs:', uniqueUserIds.size);
  if (userIds.length > 5) {
    console.log('First 5 User IDs:', userIds.slice(0,5));
  }
}
check();
