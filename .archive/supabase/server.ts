import { createServerClient } from "@supabase/ssr";
import { createContextClient, resolveEnv, verifyCredentials } from "@supabase/server/core";
import { cookies } from "next/headers";

function getSupabaseEnv() {
  const { data: env, error } = resolveEnv();
  if (error || !env) {
    throw new Error(error?.message ?? "Supabase environment is unavailable.");
  }

  const publishableKey =
    env.publishableKeys.default ?? Object.values(env.publishableKeys)[0];
  if (!publishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not configured.");
  }

  return { env, publishableKey };
}

export async function createSupabaseServerClient() {
  const { env, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

export async function getAuthenticatedSupabase() {
  const { env } = getSupabaseEnv();
  const client = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) {
    return { data: null, error: userError ?? new Error("Authentication required.") };
  }

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      data: null,
      error: sessionError ?? new Error("An active session is required."),
    };
  }

  const { data: auth, error: authError } = await verifyCredentials(
    { token: session.access_token, apikey: null },
    { auth: "user", env }
  );

  if (authError || !auth) {
    return {
      data: null,
      error: authError ?? new Error("The session could not be verified."),
    };
  }

  return {
    data: {
      supabase: createContextClient({
        auth: { token: auth.token, keyName: auth.keyName },
        env,
      }),
      user,
      claims: auth.userClaims,
    },
    error: null,
  };
}