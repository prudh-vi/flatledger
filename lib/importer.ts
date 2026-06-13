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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectDuplicates(_rows: RawRow[], _anomalies: AnomalyCollector): void {
  // feat: importer - detect duplicate rows
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectAmountIssues(_row: RawRow, _rowNumber: number, _anomalies: AnomalyCollector): void {
  // feat: importer - handle amount_with_comma, float precision, zero amount, negative amount
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectCurrencyIssues(_row: RawRow, _rowNumber: number, _anomalies: AnomalyCollector): void {
  // feat: importer - handle USD currency conversion and missing currency
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectNameIssues(_row: RawRow, _rowNumber: number, _members: KnownMembers, _anomalies: AnomalyCollector): void {
  // feat: importer - normalize paid_by names and detect ambiguous names
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectSettlements(_row: RawRow, _rowNumber: number, _anomalies: AnomalyCollector): void {
  // feat: importer - flag settlements vs expenses
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function detectSplitIssues(_row: RawRow, _rowNumber: number, _members: KnownMembers, _anomalies: AnomalyCollector): void {
  // feat: importer - percentage not 100, member left, non-member in split, split_type mismatch
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
