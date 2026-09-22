import { createClient } from "npm:@supabase/supabase-js@2.116.0"

const ALLOWED_ORIGINS = new Set([
  "https://lilchampsabacus.co.in",
  "https://www.lilchampsabacus.co.in",
])

type RecordRow = Record<string, unknown>
type Target = {
  key: string
  label: string
  place: "units" | "tens"
  mode: "single_digit" | "double_digit"
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || ""
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://lilchampsabacus.co.in",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  })
}

function int(value: unknown, min: number, max: number, fallback = 0) {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function canonicalFormula(value: string) {
  return value.replace(/-/g, "−")
}

function formulaTargets(step: RecordRow, mode: string): Target[] {
  const label = text(step.formula_label, 200)
  const matches: Target[] = []
  const pattern = /(Small Friend|Big Friend|Mix Friend)\s*([+−-])\s*([1-9])/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(label))) {
    const formula = canonicalFormula(match[1] + " " + match[2] + match[3])
    const before = label.slice(0, match.index)
    const place: "units" | "tens" = /Tens:[^·]*$/i.test(before) ? "tens" : "units"
    matches.push({
      key: place + "|" + formula,
      label: formula,
      place,
      mode: mode === "double_digit" ? "double_digit" : "single_digit",
    })
  }

  if (matches.length <= 1 || step.result !== "wrong") return matches

  const delta = Number(step.local_error_delta ?? step.error_delta)
  if (!Number.isFinite(delta) || delta === 0) return matches
  const absolute = Math.abs(delta)
  const needsUnits = absolute % 10 !== 0
  const needsTens = absolute >= 10
  const filtered = matches.filter((target) =>
    (target.place === "units" && needsUnits) || (target.place === "tens" && needsTens)
  )
  return filtered.length ? filtered : matches
}

function buildAdaptivePlan(tests: RecordRow[], drills: RecordRow[]) {
  const issueMap = new Map<string, RecordRow>()
  const recentTests = tests.slice(0, 5)

  recentTests.forEach((test, testIndex) => {
    const recencyWeight = testIndex === 0 ? 3 : testIndex === 1 ? 2 : 1
    const mode = test.mode === "double_digit" ? "double_digit" : "single_digit"
    const createdAt = String(test.created_at || "")
    const seenInTest = new Set<string>()

    const steps = Array.isArray(test.steps) ? test.steps as RecordRow[] : []
    steps.filter((step) => step.result === "wrong" || step.result === "timeout")
      .forEach((step) => {
        const kind = step.result === "wrong" ? "accuracy" : "recall"
        formulaTargets(step, mode).forEach((target) => {
          const mapKey = kind + "|" + target.key
          const current = issueMap.get(mapKey) || {
            kind,
            target_key: target.key,
            target_label: target.label,
            target_place: target.place,
            mode: target.mode,
            issue_score: 0,
            issue_count: 0,
            test_count: 0,
            last_issue_at: createdAt,
          }
          current.issue_score = Number(current.issue_score) +
            recencyWeight * (kind === "accuracy" ? 3 : 2)
          current.issue_count = Number(current.issue_count) + 1
          if (!seenInTest.has(mapKey)) {
            current.test_count = Number(current.test_count) + 1
            seenInTest.add(mapKey)
          }
          if (createdAt > String(current.last_issue_at || "")) current.last_issue_at = createdAt
          issueMap.set(mapKey, current)
        })
      })
  })

  const masteredReviews: RecordRow[] = []
  const targets = [...issueMap.values()].map((issue) => {
    const related = drills
      .filter((drill) =>
        drill.drill_kind === issue.kind &&
        drill.target_key === issue.target_key &&
        String(drill.created_at || "") > String(issue.last_issue_at || "")
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    let consecutivePasses = 0
    for (const drill of related) {
      if (drill.passed === true) consecutivePasses++
      else break
    }

    const latest = related[0]
    const mastered = issue.kind === "accuracy"
      ? consecutivePasses >= 2
      : consecutivePasses >= 2 && Number(latest?.end_limit_ms || 8000) <= 5000
    const failedPractices = related.filter((drill) => drill.passed !== true).length
    const teacherAlert = !mastered &&
      (failedPractices >= 3 || Number(issue.test_count) >= 3)
    const startLimit = issue.kind === "recall"
      ? Math.max(5000, Math.min(8000, Number(latest?.end_limit_ms || 8000)))
      : null
    const masteryStatus = mastered
      ? "mastered"
      : consecutivePasses === 1
      ? "improving"
      : related.length
      ? "practising"
      : "new"

    const target = {
      ...issue,
      consecutive_passes: consecutivePasses,
      practice_count: related.length,
      failed_practices: failedPractices,
      mastered,
      mastery_status: masteryStatus,
      teacher_alert: teacherAlert,
      start_limit_ms: startLimit,
      last_practice_at: latest?.created_at || null,
      next_review_date: mastered && latest?.practice_date
        ? new Date(new Date(String(latest.practice_date) + "T00:00:00Z").getTime() +
          3 * 86400000).toISOString().slice(0, 10)
        : null,
    }
    if (mastered) masteredReviews.push(target)
    return target
  })

  const active = targets
    .filter((target) => target.mastered !== true)
    .sort((a, b) =>
      Number(b.teacher_alert) - Number(a.teacher_alert) ||
      Number(b.issue_score) - Number(a.issue_score) ||
      (a.kind === "accuracy" ? -1 : 1)
    )
  const totalPractices = drills.length
  const hadIssues = targets.length > 0
  const latestCheckAt = String(recentTests[0]?.created_at || "")
  const latestMasteryAt = masteredReviews.reduce((latest, target) =>
    String(target.last_practice_at || "") > latest
      ? String(target.last_practice_at)
      : latest, "")
  const masteryVerifiedByNewCheck = hadIssues && active.length === 0 &&
    latestMasteryAt !== "" && latestCheckAt > latestMasteryAt

  return {
    generated_at: new Date().toISOString(),
    checks_used: recentTests.length,
    practices_used: totalPractices,
    status: active.some((target) => target.teacher_alert)
      ? "teacher_help"
      : active.length
      ? "practice_needed"
      : hadIssues && !masteryVerifiedByNewCheck
      ? "retest_ready"
      : "on_track",
    retest_ready: hadIssues && active.length === 0 && !masteryVerifiedByNewCheck,
    primary: active[0] || null,
    targets: active.slice(0, 6),
    mastered: masteredReviews.slice(0, 6),
    teacher_alerts: active.filter((target) => target.teacher_alert).slice(0, 6),
  }
}

async function loadOwnData(admin: ReturnType<typeof createClient>, userId: string) {
  const [testsResult, drillsResult] = await Promise.all([
    admin.from("speed_accuracy_tests").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(100),
    admin.from("speed_accuracy_drills").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(300),
  ])
  if (testsResult.error || drillsResult.error) throw new Error("Unable to load adaptive history")
  return {
    tests: (testsResult.data || []) as RecordRow[],
    drills: (drillsResult.data || []) as RecordRow[],
  }
}

async function loadAdaptiveData(admin: ReturnType<typeof createClient>, userId: string) {
  const [testsResult, drillsResult] = await Promise.all([
    admin.from("speed_accuracy_tests")
      .select("id,user_id,mode,created_at,steps")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("speed_accuracy_drills")
      .select("id,user_id,drill_kind,target_key,end_limit_ms,passed,practice_date,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ])
  if (testsResult.error || drillsResult.error) throw new Error("Unable to load adaptive history")
  return {
    tests: (testsResult.data || []) as RecordRow[],
    drills: (drillsResult.data || []) as RecordRow[],
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) })

  try {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader.startsWith("Bearer ")) {
      return json(req, { error: "Authentication required" }, 401)
    }

    const token = authHeader.slice(7)
    const url = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const user = userData?.user
    if (userError || !user) return json(req, { error: "Invalid login session" }, 401)

    const action = new URL(req.url).searchParams.get("action") || "context"
    const profileQuery = admin
      .from("profiles")
      .select("id,full_name,role,is_active,current_level,batch_name,centre_id,student_status")
      .eq("id", user.id)
      .single()
    const contextDataQuery = action === "context"
      ? loadAdaptiveData(admin, user.id)
      : Promise.resolve(null)
    const [{ data: profile, error: profileError }, contextData] = await Promise.all([
      profileQuery,
      contextDataQuery,
    ])

    if (profileError || !profile || profile.is_active === false) {
      return json(req, { error: "Active profile required" }, 403)
    }

    const isActiveStudent = profile.role === "student" &&
      profile.student_status === "active" &&
      profile.current_level >= 2 && profile.current_level <= 8

    if (action === "context") {
      if (!isActiveStudent) {
        return json(req, {
          error: "Speed & Accuracy Check is available only to active Level 2 to Level 8 students",
        }, 403)
      }
      const own = contextData!
      const latest = own.tests[0]
      return json(req, {
        profile,
        latest_test: latest
          ? { id: latest.id, mode: latest.mode, created_at: latest.created_at }
          : null,
        adaptive_plan: buildAdaptivePlan(own.tests, own.drills),
      })
    }

    if (action === "save") {
      if (req.method !== "POST") return json(req, { error: "POST required" }, 405)
      if (!isActiveStudent) return json(req, { error: "Student access required" }, 403)

      const body = await req.json()
      const mode = body?.mode === "double_digit"
        ? "double_digit"
        : body?.mode === "single_digit" ? "single_digit" : null
      if (!mode) return json(req, { error: "Invalid mode" }, 400)

      const steps = Array.isArray(body?.steps) ? body.steps.slice(0, 50) : []
      const row = {
        user_id: profile.id,
        student_name: profile.full_name || "Student",
        level: profile.current_level,
        batch_name: profile.batch_name || null,
        centre_id: profile.centre_id || null,
        mode,
        step_limit_ms: int(body?.step_limit_ms, 1500, 10000, 5000),
        sum_count: int(body?.sum_count, 1, 30, 10),
        steps_per_sum: int(body?.steps_per_sum, 1, 10, 5),
        total_possible_steps: int(body?.total_possible_steps, 1, 300, 50),
        analysed_steps: int(body?.analysed_steps, 0, 300, 0),
        correct_steps: int(body?.correct_steps, 0, 300, 0),
        carried_correct_steps: int(body?.carried_correct_steps, 0, 300, 0),
        wrong_steps: int(body?.wrong_steps, 0, 300, 0),
        timeout_steps: int(body?.timeout_steps, 0, 300, 0),
        cancelled_steps: int(body?.cancelled_steps, 0, 300, 0),
        root_mistakes: int(body?.root_mistakes, 0, 300, 0),
        avg_response_ms: body?.avg_response_ms == null
          ? null
          : int(body.avg_response_ms, 0, 10000, 0),
        duration_seconds: int(body?.duration_seconds, 0, 3600, 0),
        steps,
      }

      const { data, error } = await admin.from("speed_accuracy_tests")
        .insert(row).select("*").single()
      if (error) {
        return json(req, { error: "Unable to save report", detail: error.message }, 500)
      }
      const own = await loadAdaptiveData(admin, profile.id)
      return json(req, {
        ok: true,
        test: data,
        adaptive_plan: buildAdaptivePlan(own.tests, own.drills),
      })
    }

    if (action === "save-drill") {
      if (req.method !== "POST") return json(req, { error: "POST required" }, 405)
      if (!isActiveStudent) return json(req, { error: "Student access required" }, 403)

      const body = await req.json()
      const kind = body?.drill_kind === "accuracy"
        ? "accuracy"
        : body?.drill_kind === "recall" ? "recall" : null
      const mode = body?.mode === "double_digit"
        ? "double_digit"
        : body?.mode === "single_digit" ? "single_digit" : null
      const place = body?.target_place === "tens"
        ? "tens"
        : body?.target_place === "units" ? "units" : null
      const label = canonicalFormula(text(body?.target_label, 80))
      const expectedKey = place && label ? place + "|" + label : ""
      const key = text(body?.target_key, 100)
      const validFormula = /^(Small Friend|Big Friend|Mix Friend) [+−][1-9]$/.test(label)
      if (!kind || !mode || !place || !validFormula || key !== expectedKey) {
        return json(req, { error: "Invalid adaptive practice target" }, 400)
      }

      const rawResults = Array.isArray(body?.results) ? body.results.slice(0, 20) : []
      const results = rawResults.map((item: RecordRow) => {
        const result = item?.result === "correct"
          ? "correct"
          : item?.result === "timeout" ? "timeout" : "wrong"
        return {
          result,
          start: int(item?.start, 0, 9999, 0),
          operation: int(item?.operation, -99, 99, 0),
          answer: item?.answer == null ? null : int(item.answer, 0, 9999, 0),
          response_ms: item?.response_ms == null
            ? null
            : int(item.response_ms, 0, 8000, 0),
          limit_ms: item?.limit_ms == null ? null : int(item.limit_ms, 5000, 8000, 8000),
        }
      })
      if (!results.length) return json(req, { error: "Practice results are required" }, 400)
      const correct = results.filter((item) => item.result === "correct").length
      const wrong = results.filter((item) => item.result === "wrong").length
      const timeouts = results.filter((item) => item.result === "timeout").length
      const startLimit = kind === "recall"
        ? int(body?.start_limit_ms, 5000, 8000, 8000)
        : null
      const endLimit = kind === "recall"
        ? int(body?.end_limit_ms, 5000, 8000, startLimit || 8000)
        : null
      const passed = kind === "accuracy"
        ? correct >= 8 && wrong <= 2
        : correct >= 8 && timeouts <= 2 && Number(endLimit) <= 5000

      let sourceTestId: string | null = null
      if (typeof body?.source_test_id === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.source_test_id)) {
        const { data: sourceTest } = await admin.from("speed_accuracy_tests")
          .select("id").eq("id", body.source_test_id).eq("user_id", profile.id).maybeSingle()
        sourceTestId = sourceTest?.id || null
      }

      const row = {
        user_id: profile.id,
        source_test_id: sourceTestId,
        student_name: profile.full_name || "Student",
        level: profile.current_level,
        batch_name: profile.batch_name || null,
        centre_id: profile.centre_id || null,
        mode,
        drill_kind: kind,
        target_key: key,
        target_label: label,
        target_place: place,
        start_limit_ms: startLimit,
        end_limit_ms: endLimit,
        question_count: results.length,
        correct_count: correct,
        wrong_count: wrong,
        timeout_count: timeouts,
        passed,
        mastered: false,
        results,
      }

      const { data, error } = await admin.from("speed_accuracy_drills")
        .insert(row).select("*").single()
      if (error) {
        return json(req, { error: "Unable to save practice", detail: error.message }, 500)
      }
      const own = await loadAdaptiveData(admin, profile.id)
      const adaptivePlan = buildAdaptivePlan(own.tests, own.drills)
      const current = [
        ...(adaptivePlan.targets as RecordRow[]),
        ...(adaptivePlan.mastered as RecordRow[]),
      ].find((target) => target.target_key === key && target.kind === kind)
      if (current?.mastered === true) {
        await admin.from("speed_accuracy_drills").update({ mastered: true }).eq("id", data.id)
      }
      return json(req, { ok: true, drill: data, adaptive_plan: adaptivePlan })
    }

    if (action === "own-tests") {
      if (profile.role !== "student") {
        return json(req, { error: "Student access required" }, 403)
      }
      const own = await loadOwnData(admin, profile.id)
      return json(req, {
        profile,
        rows: own.tests,
        drills: own.drills,
        adaptive_plan: buildAdaptivePlan(own.tests, own.drills),
      })
    }

    if (action === "staff-tests") {
      if (!["admin", "teacher"].includes(profile.role)) {
        return json(req, { error: "Staff access required" }, 403)
      }
      const [testsResult, drillsResult] = await Promise.all([
        admin.from("speed_accuracy_tests").select("*")
          .order("created_at", { ascending: false }).limit(3000),
        admin.from("speed_accuracy_drills").select("*")
          .order("created_at", { ascending: false }).limit(10000),
      ])
      if (testsResult.error || drillsResult.error) {
        return json(req, { error: "Unable to load reports" }, 500)
      }
      const rows = (testsResult.data || []) as RecordRow[]
      const drills = (drillsResult.data || []) as RecordRow[]
      const userIds = [...new Set(rows.map((row) => String(row.user_id)))]
      const adaptiveByUser: Record<string, unknown> = {}
      userIds.forEach((userId) => {
        adaptiveByUser[userId] = buildAdaptivePlan(
          rows.filter((row) => String(row.user_id) === userId),
          drills.filter((drill) => String(drill.user_id) === userId),
        )
      })
      return json(req, {
        profile,
        rows,
        drills,
        adaptive_by_user: adaptiveByUser,
      })
    }

    return json(req, { error: "Unknown action" }, 404)
  } catch (error) {
    return json(req, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    }, 500)
  }
})
