import { createClient } from "npm:@supabase/supabase-js@2.116.0"

const allowedOrigins = new Set([
  "https://lilchampsabacus.co.in",
  "https://www.lilchampsabacus.co.in",
])

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin")
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin)
      ? origin
      : "https://lilchampsabacus.co.in",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(req),
  })
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "A valid student email is required.")
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "A valid student email is required.")
  }
  return email
}

function normalizeName(value: unknown, label: string) {
  if (typeof value !== "string") throw new HttpError(400, `${label} is required.`)
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length < 1 || name.length > 50 || !/^[\p{L}\p{M} .'-]+$/u.test(name)) {
    throw new HttpError(400, `${label} contains invalid characters.`)
  }
  return name
}

function emailPart(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
}

function randomCharacter(characters: string) {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return characters[bytes[0] % characters.length]
}

function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const digits = "23456789"
  const special = "!@#$%"
  const all = upper + lower + digits + special
  const characters = [
    randomCharacter(upper),
    randomCharacter(lower),
    randomCharacter(digits),
    randomCharacter(special),
  ]

  while (characters.length < 14) characters.push(randomCharacter(all))

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const swapIndex = bytes[0] % (index + 1)
    ;[characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]]
  }

  return characters.join("")
}

function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 72) {
    throw new HttpError(400, "Password must be between 8 and 72 characters.")
  }
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new HttpError(400, "Password must include uppercase, lowercase and a number.")
  }
  return value
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin")
    if (origin && !allowedOrigins.has(origin)) return json(req, { error: "Origin not allowed." }, 403)
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  try {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed.")

    const origin = req.headers.get("origin")
    if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, "Origin not allowed.")

    const authHeader = req.headers.get("authorization")
    if (!authHeader?.match(/^Bearer\s+\S+$/i)) {
      throw new HttpError(401, "Login required.")
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError(500, "Server configuration error.")

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const token = authHeader.replace(/^Bearer\s+/i, "")
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    const caller = userData.user
    if (userError || !caller) throw new HttpError(401, "Invalid or expired login.")

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", caller.id)
      .maybeSingle()

    if (callerProfileError) throw callerProfileError
    if (!callerProfile || callerProfile.role !== "admin" || callerProfile.is_active !== true) {
      throw new HttpError(403, "Admin access required.")
    }

    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      throw new HttpError(400, "Invalid request body.")
    }

    const action = payload.action
    if (!['enroll', 'resetPassword', 'toggleAccess'].includes(String(action))) {
      throw new HttpError(400, "Invalid action.")
    }

    const findStudentByEmail = async (rawEmail: unknown) => {
      const email = normalizeEmail(rawEmail)
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (error) throw error

      const targetUser = data.users.find((user) => user.email?.toLowerCase() === email)
      if (!targetUser) throw new HttpError(404, "Student email not found.")

      const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", targetUser.id)
        .maybeSingle()

      if (targetProfileError) throw targetProfileError
      if (!targetProfile || targetProfile.role !== "student") {
        throw new HttpError(403, "Only student accounts can be changed.")
      }

      return { email, targetUser }
    }

    const adminEmail = caller.email ?? caller.id

    if (action === "enroll") {
      const firstName = normalizeName(payload.firstName, "First name")
      const lastName = normalizeName(payload.lastName, "Surname")
      const level = Number(payload.level)
      if (!Number.isInteger(level) || level < 1 || level > 8) {
        throw new HttpError(400, "Level must be between 1 and 8.")
      }

      const firstPart = emailPart(firstName)
      const lastPart = emailPart(lastName)
      if (!firstPart || !lastPart) throw new HttpError(400, "Names must contain English letters for the login email.")

      const studentEmail = `${firstPart}.${lastPart}@gmail.com`
      const temporaryPassword = generateTemporaryPassword()
      const fullName = `${firstName} ${lastName}`

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: studentEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

      if (authError) {
        if (/already|registered|exists/i.test(authError.message)) {
          throw new HttpError(409, "A user with this email already exists.")
        }
        throw authError
      }

      try {
        const { error: profileError } = await supabaseAdmin.from("profiles").insert({
          id: authUser.user.id,
          full_name: fullName,
          role: "student",
          current_level: level,
          is_active: true,
        })
        if (profileError) throw profileError

        const { error: logError } = await supabaseAdmin.from("activity_logs").insert({
          admin_name: adminEmail,
          action_type: "Enrolled Student",
          target_student: fullName,
          details: `Level ${level}`,
        })
        if (logError) throw logError
      } catch (error) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
        throw error
      }

      return json(req, {
        message: "Student enrolled successfully.",
        email: studentEmail,
        temporaryPassword,
      })
    }

    if (action === "resetPassword") {
      const { email, targetUser } = await findStudentByEmail(payload.email)
      const newPassword = validatePassword(payload.newPassword)

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
        password: newPassword,
      })
      if (updateError) throw updateError

      const { error: logError } = await supabaseAdmin.from("security_logs").insert({
        admin_email: adminEmail,
        action_type: "PASSWORD_FORCE_RESET",
        target_student_email: email,
        status: "Success",
      })
      if (logError) throw logError

      return json(req, { message: "Student password updated." })
    }

    const { email, targetUser } = await findStudentByEmail(payload.email)
    const status = payload.status
    if (status !== "ACTIVE" && status !== "BLOCKED") {
      throw new HttpError(400, "Status must be ACTIVE or BLOCKED.")
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: status === "ACTIVE" })
      .eq("id", targetUser.id)
      .eq("role", "student")
    if (updateError) throw updateError

    const { error: logError } = await supabaseAdmin.from("security_logs").insert({
      admin_email: adminEmail,
      action_type: status === "BLOCKED" ? "ACCESS_REVOKED" : "ACCESS_RESTORED",
      target_student_email: email,
      status: "Success",
    })
    if (logError) throw logError

    return json(req, { message: `Student is now ${status}.` })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError
      ? error.message
      : "The request could not be completed."
    console.error("manage-student error", error)
    return json(req, { error: message }, status)
  }
})
