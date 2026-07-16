import {
  adminClient,
  classifyEvent,
  corsHeaders,
  dgFetch,
  extractDecimalOdds,
  jsonResponse,
  oddsToSalaries,
  requireAdmin,
  thursdayLockAt,
} from "../_shared/datagolf.ts";

type ScheduleEvent = {
  event_id?: string | number;
  event_name?: string;
  start_date?: string;
  end_date?: string;
  course?: string;
  location?: string;
};

type FieldPlayer = {
  dg_id?: string | number;
  player_name?: string;
  first_name?: string;
  last_name?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);
    const admin = adminClient();
    const seasonYear = new Date().getUTCFullYear();

    // 1) Upsert upcoming schedule (PGA)
    const scheduleRaw = await dgFetch<unknown>("/get-schedule", {
      tour: "pga",
      season: seasonYear,
      upcoming_only: "no",
    });

    const scheduleEvents = normalizeSchedule(scheduleRaw);
    let tournamentsUpserted = 0;

    for (const ev of scheduleEvents) {
      const dgEventId = String(ev.event_id ?? "");
      const name = ev.event_name?.trim();
      if (!dgEventId || !name) continue;

      const eventType = classifyEvent(name);
      const startDate = ev.start_date ?? null;
      const endDate = ev.end_date ?? startDate;
      const lockAt = thursdayLockAt(startDate);

      const { error } = await admin.from("tournaments").upsert(
        {
          dg_event_id: dgEventId,
          name,
          start_date: startDate,
          end_date: endDate,
          season_year: seasonYear,
          event_type: eventType,
          fedex_multiplier: 1.0,
          lineup_lock_at: lockAt,
        },
        { onConflict: "dg_event_id" },
      );
      if (error) throw new Error(`Tournament upsert failed: ${error.message}`);
      tournamentsUpserted += 1;
    }

    // 2) Current field + outrights for active PGA event
    const [fieldRaw, outrightsRaw] = await Promise.all([
      dgFetch<unknown>("/field-updates", { tour: "pga" }),
      dgFetch<unknown>("/betting-tools/outrights", {
        tour: "pga",
        market: "win",
        odds_format: "decimal",
      }),
    ]);

    const fieldMeta = extractFieldMeta(fieldRaw);
    const fieldPlayers = extractFieldPlayers(fieldRaw);
    const oddsRows = extractOddsRows(outrightsRaw);

    if (!fieldMeta.eventId && !fieldMeta.eventName) {
      return jsonResponse({
        message: "Schedule synced, but no current PGA field available.",
        tournamentsUpserted,
        golfersUpserted: 0,
        pricesUpserted: 0,
      });
    }

    // Resolve tournament row
    let tournamentId: string | null = null;
    if (fieldMeta.eventId) {
      const { data } = await admin
        .from("tournaments")
        .select("id")
        .eq("dg_event_id", fieldMeta.eventId)
        .maybeSingle();
      tournamentId = data?.id ?? null;
    }
    if (!tournamentId && fieldMeta.eventName) {
      const { data } = await admin
        .from("tournaments")
        .select("id, dg_event_id")
        .ilike("name", fieldMeta.eventName)
        .eq("season_year", seasonYear)
        .maybeSingle();
      tournamentId = data?.id ?? null;
    }
    if (!tournamentId) {
      // Create from field meta if schedule missed it
      const dgEventId = fieldMeta.eventId ?? `field-${seasonYear}-${slugify(fieldMeta.eventName ?? "event")}`;
      const name = fieldMeta.eventName ?? `PGA Event ${dgEventId}`;
      const { data, error } = await admin
        .from("tournaments")
        .upsert(
          {
            dg_event_id: dgEventId,
            name,
            season_year: seasonYear,
            event_type: classifyEvent(name),
            fedex_multiplier: 1.0,
            status: "open",
            lineup_lock_at: thursdayLockAt(fieldMeta.startDate),
            start_date: fieldMeta.startDate,
          },
          { onConflict: "dg_event_id" },
        )
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to create tournament from field");
      tournamentId = data.id;
    }

    // Mark active tournament open (keep completed as-is)
    await admin
      .from("tournaments")
      .update({ status: "open" })
      .eq("id", tournamentId)
      .neq("status", "completed");

    // Build odds map by dg_id
    const oddsByDg = new Map<string, number>();
    for (const row of oddsRows) {
      const dgId = String(row.dg_id ?? "");
      if (!dgId) continue;
      const odds = extractDecimalOdds(row);
      if (odds) oddsByDg.set(dgId, odds);
    }

    // Upsert golfers from field
    const golferIdByDg = new Map<string, string>();
    let golfersUpserted = 0;
    for (const p of fieldPlayers) {
      const dgId = String(p.dg_id ?? "");
      if (!dgId) continue;
      const name = formatPlayerName(p);
      if (!name) continue;

      const { data: existing } = await admin
        .from("golfers")
        .select("id")
        .eq("dg_player_id", dgId)
        .maybeSingle();

      if (existing) {
        await admin
          .from("golfers")
          .update({ name, is_active: true, tournament_name: fieldMeta.eventName })
          .eq("id", existing.id);
        golferIdByDg.set(dgId, existing.id);
      } else {
        const { data: created, error } = await admin
          .from("golfers")
          .insert({
            name,
            dg_player_id: dgId,
            is_active: true,
            salary: 0,
            tournament_name: fieldMeta.eventName,
          })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Golfer insert failed");
        golferIdByDg.set(dgId, created.id);
      }
      golfersUpserted += 1;
    }

    // Deactivate golfers not in this field (optional soft cleanup of pool display)
    const activeDgIds = [...golferIdByDg.keys()];
    if (activeDgIds.length > 0) {
      // leave historical golfers; prices table scopes the draft pool
    }

    // Players with odds; fallback for field-only: mid salary
    const pricedInputs = [...golferIdByDg.keys()]
      .filter((dgId) => oddsByDg.has(dgId))
      .map((dgId) => ({ dgId, decimalOdds: oddsByDg.get(dgId)! }));

    const salaryMap = oddsToSalaries(pricedInputs);
    const priceRows: {
      tournament_id: string;
      golfer_id: string;
      salary: number;
      decimal_odds: number | null;
      implied_prob: number | null;
    }[] = [];

    for (const [dgId, golferId] of golferIdByDg) {
      const priced = salaryMap.get(dgId);
      if (priced) {
        priceRows.push({
          tournament_id: tournamentId,
          golfer_id: golferId,
          salary: priced.salary,
          decimal_odds: priced.decimalOdds,
          implied_prob: Number(priced.impliedProb.toFixed(6)),
        });
        // Keep legacy golfers.salary in sync for older UI paths
        await admin.from("golfers").update({ salary: priced.salary }).eq("id", golferId);
      } else {
        priceRows.push({
          tournament_id: tournamentId,
          golfer_id: golferId,
          salary: 7000,
          decimal_odds: null,
          implied_prob: null,
        });
        await admin.from("golfers").update({ salary: 7000 }).eq("id", golferId);
      }
    }

    // Replace prices for this tournament
    await admin.from("player_prices").delete().eq("tournament_id", tournamentId);
    if (priceRows.length > 0) {
      const { error: priceError } = await admin.from("player_prices").insert(priceRows);
      if (priceError) throw new Error(`Price insert failed: ${priceError.message}`);
    }

    return jsonResponse({
      message: `Synced ${fieldMeta.eventName ?? "event"}: ${golfersUpserted} golfers, ${priceRows.length} prices.`,
      tournamentId,
      eventName: fieldMeta.eventName,
      tournamentsUpserted,
      golfersUpserted,
      pricesUpserted: priceRows.length,
      withOdds: salaryMap.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync-odds failed";
    const status = message === "Unauthorized" || message === "Admins only" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});

function normalizeSchedule(raw: unknown): ScheduleEvent[] {
  if (Array.isArray(raw)) return raw as ScheduleEvent[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["schedule", "events", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as ScheduleEvent[];
    }
  }
  return [];
}

function extractFieldMeta(raw: unknown): {
  eventId: string | null;
  eventName: string | null;
  startDate: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return { eventId: null, eventName: null, startDate: null };
  }
  const obj = raw as Record<string, unknown>;
  const eventId = obj.event_id != null ? String(obj.event_id) : null;
  const eventName = typeof obj.event_name === "string" ? obj.event_name : null;
  const startDate = typeof obj.start_date === "string" ? obj.start_date : null;
  return { eventId, eventName, startDate };
}

function extractFieldPlayers(raw: unknown): FieldPlayer[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.field)) return obj.field as FieldPlayer[];
  if (Array.isArray(obj.data)) return obj.data as FieldPlayer[];
  if (Array.isArray(raw)) return raw as FieldPlayer[];
  return [];
}

function extractOddsRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["odds", "data", "players", "outrights"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

function formatPlayerName(p: FieldPlayer): string {
  if (p.player_name?.trim()) {
    // DataGolf often uses "Last, First"
    const name = p.player_name.trim();
    if (name.includes(",")) {
      const [last, first] = name.split(",").map((s) => s.trim());
      if (first && last) return `${first} ${last}`;
    }
    return name;
  }
  if (p.first_name || p.last_name) {
    return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  }
  return "";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}
