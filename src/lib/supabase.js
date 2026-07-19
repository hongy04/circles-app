import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_KEY,
  SUPABASE_URL,
  validatePublicEnvironment,
} from '../config/env';

validatePublicEnvironment();

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
