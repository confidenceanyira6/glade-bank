import { createClient } from '@supabase/supabase-js';

// Publishable (anon) key is safe in the browser. Override with env vars if needed.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://lfyzzscwgtikkoyufsho.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_HfX4xwgtB0TmVD-eQay5yQ_G6-xRt7x';

export const supabase = createClient(url, key);
