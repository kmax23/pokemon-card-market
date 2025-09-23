export default async function handler(req: Request) {
  console.log("Edge Function invoked");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  console.log("SUPABASE_URL:", url);
  console.log("Service role key exists:", !!key);

  try {
    const response = await fetch(`${url}/rest/v1/rpc/refresh_daily_index_prices`, {
      method: "POST",
      headers: {
        apikey: key!,
        Authorization: `Bearer ${key!}`,
        "Content-Type": "application/json",
      },
    });

    const text = await response.text();
    console.log("RPC response:", text);

    return new Response(JSON.stringify({ success: true, rpc: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
