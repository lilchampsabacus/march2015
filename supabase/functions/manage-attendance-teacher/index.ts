import { createClient } from "npm:@supabase/supabase-js@2.116.0"

const origins = new Set(["https://lilchampsabacus.co.in", "https://www.lilchampsabacus.co.in"])
Deno.serve(async req => {
  const origin = req.headers.get("origin") || "https://lilchampsabacus.co.in"
  const headers = {"Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://lilchampsabacus.co.in",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json", "Vary":"Origin"}
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers})
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers})
  if (req.method !== "POST" || (req.headers.get("origin") && !origins.has(origin))) return respond({error:"Request not allowed"},403)
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return respond({error:"Server configuration missing"},500)
  const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "")
  if (!token) return respond({error:"Login required"},401)
  const {data:{user}} = await admin.auth.getUser(token)
  if (!user) return respond({error:"Login expired"},401)
  const {data:caller} = await admin.from("profiles").select("role,is_active").eq("id",user.id).maybeSingle()
  if (caller?.role !== "admin" || caller.is_active !== true) return respond({error:"Admin access required"},403)
  try {
    const body = await req.json()
    const name = String(body.name || "").trim().replace(/\s+/g," ")
    const email = String(body.email || "").trim().toLowerCase()
    if (name.length<2 || name.length>70 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({error:"Enter teacher name and a unique email address"},400)
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const password = "T!" + Array.from(bytes, n => n.toString(16).padStart(2,"0")).join("")
    const {data:created,error} = await admin.auth.admin.createUser({email,password,email_confirm:true})
    if (error || !created.user) return respond({error:error?.message || "Could not create teacher"},400)
    const {error:profileError} = await admin.from("profiles").upsert({id:created.user.id,full_name:name,role:"teacher",is_active:true})
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return respond({error:"Could not create teacher profile"},500)
    }
    return respond({id:created.user.id,email,password})
  } catch { return respond({error:"Invalid request"},400) }
})
