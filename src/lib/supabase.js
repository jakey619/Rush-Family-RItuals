import { createClient } from "@supabase/supabase-js";

export const FAMILY_ID = import.meta.env.VITE_FAMILY_ID || "rush-family";
export const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

function createNoopChannel() {
  return {
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
  };
}

function createNoopClient() {
  return {
    from() {
      return {
        select() {
          return {
            eq: async () => ({ data: [], error: null }),
          };
        },
        upsert: async () => ({ data: null, error: null }),
      };
    },
    channel() {
      return createNoopChannel();
    },
    removeChannel() {},
  };
}

export const supabase = hasSupabaseConfig
  ? createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    )
  : createNoopClient();
