import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────

export interface RawRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
}

export interface Anomaly {
  rowNumber: number;
  rawData: Record<string, string>;
  anomalyType: AnomalyType;
  description: string;
  suggestedAction: string;
  requiresApproval: boolean;
  autoResolved: boolean;
}

export interface ImportResult {
  sessionId: string;
  totalRows: number;
  anomalies: Anomaly[];
  readyToImport: number;
}

export type AnomalyType =
  | "DUPLICATE"
  | "AMOUNT_WITH_COMMA"
  | "MISSING_PAID_BY"
  | "SETTLEMENT_AS_EXPENSE"
  | "FLOAT_PRECISION"
  | "NAME_NORMALIZATION"
  | "AMBIGUOUS_NAME"
  | "PERCENTAGE_NOT_100"
  | "USD_CURRENCY"
  | "NEGATIVE_AMOUNT"
  | "AMBIGUOUS_DATE"
  | "MISSING_CURRENCY"
  | "ZERO_AMOUNT"
  | "MEMBER_LEFT"
  | "NON_MEMBER_IN_SPLIT"
  | "SPLIT_TYPE_MISMATCH";

// ── Constants ────────────────────────────────────────────────

const REQUIRED_COLUMNS: (keyof RawRow)[] = [
  "date",
  "description",
  "paid_by",
  "amount",
  "currency",
  "split_type",
  "split_with",
  "split_details",
  "notes",
];

// ── CSV Parsing ──────────────────────────────────────────────

function parseCSV(csvString: string): { rows: RawRow[]; errors: string[] } {
  const result = Papa.parse<RawRow>(csvString.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const errors: string[] = [];

  if (result.errors.length > 0) {
    result.errors.forEach((e) => errors.push(`Row ${e.row ?? "?"}: ${e.message}`));
  }

  return { rows: result.data, errors };
}

// ── Column Validation ────────────────────────────────────────

function validateHeaders(rows: RawRow[]): string[] {
  if (rows.length === 0) return ["CSV is empty or has no data rows."];

  const presentColumns = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter((col) => !presentColumns.includes(col));

  if (missing.length > 0) {
    return [`Missing required columns: ${missing.join(", ")}`];
  }

  return [];
}

// ── Anomaly Detection Stubs ──────────────────────────────────
// Each function is filled in across subsequent commits.
// They receive the full row list and known members, and push
// into the shared anomalies array.

type AnomalyCollector = Anomaly[];
type KnownMembers = Array<{ id: string; name: string; left_at: string | null; joined_at: string }>;

function detectDuplicates(rows: RawRow[], anomalies: AnomalyCollector): void {
  const seen = new Map<string, number>(); // key → first rowNumber

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const key = [
      row.date.trim().toLowerCase(),
      row.description.trim().toLowerCase(),
      row.amount.trim().replace(/,/g, ""),
    ].join("|");

    if (seen.has(key)) {
      anomalies.push({
        rowNumber,
        rawData: row as unknown as Record<string, string>,
        anomalyType: "DUPLICATE",
        description: `Duplicate of row ${seen.get(key)}: same date, description, and amount (case-insensitive).`,
        suggestedAction: "Skip this row",
        requiresApproval: true,
        autoResolved: false,
      });
    } else {
      seen.set(key, rowNumber);
    }
  });
}

function detectAmountIssues(row: RawRow, rowNumber: number, anomalies: AnomalyCollector): void {
  const raw = row.amount?.trim() ?? "";

  // AMOUNT_WITH_COMMA — e.g. "1,500.00"
  const hasComma = raw.includes(",");
  const cleaned = raw.replace(/,/g, "");
  const amount = parseFloat(cleaned);

  if (hasComma) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "AMOUNT_WITH_COMMA",
      description: `Amount "${raw}" contains commas — interpreted as ${cleaned}.`,
      suggestedAction: `Store as ${cleaned}`,
      requiresApproval: false,
      autoResolved: true,
    });
  }

  if (isNaN(amount)) return;

  // ZERO_AMOUNT
  if (amount === 0) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "ZERO_AMOUNT",
      description: "Amount is zero — likely a data entry error.",
      suggestedAction: "Skip row",
      requiresApproval: true,
      autoResolved: false,
    });
    return;
  }

  // NEGATIVE_AMOUNT
  if (amount < 0) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "NEGATIVE_AMOUNT",
      description: `Amount is negative (${amount}) — may indicate a refund or data error.`,
      suggestedAction: "Review and confirm intent",
      requiresApproval: true,
      autoResolved: false,
    });
    return;
  }

  // FLOAT_PRECISION — more than 2 decimal places
  const decimalPart = cleaned.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "FLOAT_PRECISION",
      description: `Amount "${cleaned}" has ${decimalPart.length} decimal places — will be rounded to ${amount.toFixed(2)}.`,
      suggestedAction: `Round to ${amount.toFixed(2)}`,
      requiresApproval: false,
      autoResolved: true,
    });
  }
}

const USD_TO_INR_RATE = 85.21;

function detectCurrencyIssues(row: RawRow, rowNumber: number, anomalies: AnomalyCollector): void {
  const currency = row.currency?.trim().toUpperCase();

  // MISSING_CURRENCY — default to INR
  if (!currency || currency === "NAN" || currency === "") {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "MISSING_CURRENCY",
      description: "No currency specified — defaulting to INR.",
      suggestedAction: "Treat as INR",
      requiresApproval: false,
      autoResolved: true,
    });
    return;
  }

  // USD_CURRENCY — convert to INR at current rate
  if (currency === "USD") {
    const rawAmount = parseFloat(row.amount.replace(/,/g, ""));
    if (!isNaN(rawAmount)) {
      const convertedInr = rawAmount * USD_TO_INR_RATE;
      anomalies.push({
        rowNumber,
        rawData: row as unknown as Record<string, string>,
        anomalyType: "USD_CURRENCY",
        description: `Amount $${rawAmount} USD converted to ₹${convertedInr.toFixed(2)} INR at rate ${USD_TO_INR_RATE}.`,
        suggestedAction: `Store as ₹${convertedInr.toFixed(2)} INR (rate: ${USD_TO_INR_RATE})`,
        requiresApproval: false,
        autoResolved: true,
      });
    }
  }
}

function toTitleCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fuzzyMatchMember(
  raw: string,
  members: KnownMembers
): { matched: KnownMembers[0] | null; ambiguous: boolean } {
  const normalized = toTitleCase(raw);

  // 1. Exact match after title-casing
  const exact = members.find((m) => m.name === normalized);
  if (exact) return { matched: exact, ambiguous: false };

  // 2. Partial match: member name starts with the normalized input
  const partials = members.filter((m) =>
    m.name.toLowerCase().startsWith(normalized.toLowerCase())
  );
  if (partials.length === 1) return { matched: partials[0], ambiguous: false };
  if (partials.length > 1) return { matched: null, ambiguous: true };

  // 3. Contains match
  const contains = members.filter((m) =>
    m.name.toLowerCase().includes(normalized.toLowerCase())
  );
  if (contains.length === 1) return { matched: contains[0], ambiguous: false };

  return { matched: null, ambiguous: contains.length > 1 };
}

function detectNameIssues(
  row: RawRow,
  rowNumber: number,
  members: KnownMembers,
  anomalies: AnomalyCollector
): void {
  const raw = row.paid_by?.trim() ?? "";

  // MISSING_PAID_BY
  if (!raw || raw.toLowerCase() === "nan") {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "MISSING_PAID_BY",
      description: "paid_by is empty or NaN — cannot determine who paid.",
      suggestedAction: "Skip row (unresolvable)",
      requiresApproval: false,
      autoResolved: false,
    });
    return;
  }

  const normalized = toTitleCase(raw);
  const { matched, ambiguous } = fuzzyMatchMember(raw, members);

  // NAME_NORMALIZATION — name changed but uniquely matched
  if (matched && matched.name !== raw) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "NAME_NORMALIZATION",
      description: `"${raw}" normalized to "${matched.name}".`,
      suggestedAction: `Use "${matched.name}"`,
      requiresApproval: false,
      autoResolved: true,
    });
    return;
  }

  // AMBIGUOUS_NAME — couldn't resolve to a single member
  if (!matched) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "AMBIGUOUS_NAME",
      description: ambiguous
        ? `"${normalized}" matches multiple members — cannot auto-resolve.`
        : `"${normalized}" does not match any known group member.`,
      suggestedAction: "Map to a known member during review",
      requiresApproval: true,
      autoResolved: false,
    });
  }
}

const SETTLEMENT_KEYWORDS = ["settlement", "settle", "paid back", "payback", "reimburs", "repay"];

function detectSettlements(row: RawRow, rowNumber: number, anomalies: AnomalyCollector): void {
  const splitType = row.split_type?.trim().toUpperCase();
  const description = row.description?.trim().toLowerCase() ?? "";

  const isSettlementSplitType = splitType === "SETTLEMENT";
  const hasSettlementKeyword = SETTLEMENT_KEYWORDS.some((kw) => description.includes(kw));

  if (isSettlementSplitType || hasSettlementKeyword) {
    anomalies.push({
      rowNumber,
      rawData: row as unknown as Record<string, string>,
      anomalyType: "SETTLEMENT_AS_EXPENSE",
      description: isSettlementSplitType
        ? `split_type is "SETTLEMENT" — this row should be recorded as a settlement, not an expense.`
        : `Description "${row.description.trim()}" suggests a settlement payment imported as an expense.`,
      suggestedAction: "Convert to settlement record",
      requiresApproval: true,
      autoResolved: false,
    });
  }
}

function parsePercentages(splitDetails: string): number[] {
  // Handles: "Rohan:40,Priya:35,Aisha:25" | "40,35,25" | "40%,35%,25%"
  return splitDetails
    .split(",")
    .map((part) => {
      const match = part.trim().match(/[\d.]+/);
      return match ? parseFloat(match[0]) : NaN;
    })
    .filter((n) => !isNaN(n));
}

function detectSplitIssues(
  row: RawRow,
  rowNumber: number,
  _members: KnownMembers,
  anomalies: AnomalyCollector
): void {
  const splitType = row.split_type?.trim().toUpperCase();
  const splitDetails = row.split_details?.trim();

  // PERCENTAGE_NOT_100
  if (splitType === "PERCENTAGE" && splitDetails) {
    const percentages = parsePercentages(splitDetails);

    if (percentages.length === 0) {
      anomalies.push({
        rowNumber,
        rawData: row as unknown as Record<string, string>,
        anomalyType: "PERCENTAGE_NOT_100",
        description: "split_type is PERCENTAGE but no valid percentages found in split_details.",
        suggestedAction: "Reject row — fix split_details before re-importing",
        requiresApproval: false,
        autoResolved: false,
      });
      return;
    }

    const sum = percentages.reduce((a, b) => a + b, 0);
    const rounded = Math.round(sum * 100) / 100;

    if (rounded !== 100) {
      anomalies.push({
        rowNumber,
        rawData: row as unknown as Record<string, string>,
        anomalyType: "PERCENTAGE_NOT_100",
        description: `Percentages sum to ${rounded}% instead of 100% (values: ${percentages.join(", ")}).`,
        suggestedAction: "Reject row — percentages must sum to exactly 100%",
        requiresApproval: false,
        autoResolved: false,
      });
    }
  }

  // feat: importer - member left, non-member in split, split_type mismatch (next commits)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectDateIssues(_row: RawRow, _rowNumber: number, _anomalies: AnomalyCollector): void {
  // feat: importer - ambiguous date detection
}

// ── Phase 1 Entry Point ──────────────────────────────────────

export async function runImportPhase1(
  csvString: string,
  groupId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<ImportResult & { validationErrors?: string[] }> {
  // 1. Parse CSV
  const { rows, errors: parseErrors } = parseCSV(csvString);
  if (parseErrors.length > 0) {
    return { sessionId: "", totalRows: 0, anomalies: [], readyToImport: 0, validationErrors: parseErrors };
  }

  // 2. Validate columns
  const headerErrors = validateHeaders(rows);
  if (headerErrors.length > 0) {
    return { sessionId: "", totalRows: 0, anomalies: [], readyToImport: 0, validationErrors: headerErrors };
  }

  // 3. Load known group members for name/membership checks
  const { data: members } = await supabase
    .from("group_memberships")
    .select("user_id, joined_at, left_at, profiles(name)")
    .eq("group_id", groupId);

  const knownMembers: KnownMembers = (members ?? []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.name ?? "",
    joined_at: m.joined_at,
    left_at: m.left_at,
  }));

  // 4. Run anomaly detection over every row
  const anomalies: AnomalyCollector = [];

  detectDuplicates(rows, anomalies);

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    detectAmountIssues(row, rowNumber, anomalies);
    detectCurrencyIssues(row, rowNumber, anomalies);
    detectNameIssues(row, rowNumber, knownMembers, anomalies);
    detectSettlements(row, rowNumber, anomalies);
    detectSplitIssues(row, rowNumber, knownMembers, anomalies);
    detectDateIssues(row, rowNumber, anomalies);
  });

  // 5. Create import session in DB
  const { data: session, error: sessionError } = await supabase
    .from("import_sessions")
    .insert({
      group_id: groupId,
      created_by: userId,
      status: "PENDING",
      total_rows: rows.length,
      anomalies_count: anomalies.length,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    throw new Error(`Failed to create import session: ${sessionError?.message}`);
  }

  // 6. Persist anomalies
  if (anomalies.length > 0) {
    await supabase.from("import_anomalies").insert(
      anomalies.map((a) => ({
        import_session_id: session.id,
        row_number: a.rowNumber,
        raw_row: a.rawData,
        anomaly_type: a.anomalyType,
        description: a.description,
        action_taken: a.suggestedAction,
        requires_approval: a.requiresApproval,
        approved: a.autoResolved ? true : null,
      }))
    );
  }

  const unresolvable = anomalies.filter(
    (a) => a.anomalyType === "MISSING_PAID_BY" || a.anomalyType === "PERCENTAGE_NOT_100"
  );

  return {
    sessionId: session.id,
    totalRows: rows.length,
    anomalies,
    readyToImport: rows.length - unresolvable.length,
  };
}
