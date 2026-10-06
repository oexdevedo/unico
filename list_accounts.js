const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://iwpveyworwdymlzdmloq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3cHZleXdvcndkeW1semRtbG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjcyNjksImV4cCI6MjA5MjUwMzI2OX0.8HyxCqcwQTc7-EFZQqOJbLr18h79dn6Ywyk1oDphaCI';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: users } = await supabase.from('app_users').select('*');
  console.log("=== APP_USERS ===");
  console.log(users);
  
  const { data: accounts } = await supabase.from('accounts').select('*');
  console.log("\n=== ACCOUNTS ===");
  console.log(accounts);
}
run();
