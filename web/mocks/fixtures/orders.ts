import type { Check, Field, Group, Order, Read, Triage } from "@/lib/api/types";
import { withRecount } from "@/lib/order";
import { boxFor, type BBox, type FaxSpec, type LineKey } from "../fax";

// Demo-story fixtures: clean, smudged, controlled, processing, plus quiet "ready" filler orders.

const MODELS = {
  model_a: "anthropic/claude-sonnet-5-5",
  model_b: "openai/gpt-5.1",
  model_c: "google/gemini-3-pro",
} as const;

const jitter = (b: BBox, dx: number, dy: number): BBox =>
  [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy].map((n) =>
    Math.min(1, Math.max(0, Math.round(n * 10_000) / 10_000)),
  ) as BBox;

interface FieldSpec {
  group: Group;
  name: string;
  label: string;
  line: LineKey;
  /** Value the system settled on. */
  value: string | null;
  /** Substring of the printed line this field was read from (route/frequency live inside the sig). */
  sub?: string;
  triage?: Triage;
  confidence?: number;
  reasons?: string[];
  risk?: "high" | "normal";
  normalized?: Record<string, unknown> | null;
  checks?: Check[];
  /** Per-source value overrides; defaults to everyone reading `value`. */
  reads?: Partial<Record<"model_a" | "model_b" | "model_c" | "ocr", string | null>>;
  ocr?: number;
}

function buildField(spec: FieldSpec, lineText: string, page: number): Field {
  const box = boxFor(spec.line, lineText, spec.sub);
  const seen = spec.sub ?? lineText;
  const sources = ["model_a", "model_b", "model_c", "ocr"] as const;
  const offsets: Record<(typeof sources)[number], [number, number]> = {
    model_a: [0, 0],
    model_b: [0.002, -0.001],
    model_c: [-0.002, 0.001],
    ocr: [0.001, 0.0015],
  };
  const reads: Read[] = sources.map((source) => {
    const value = spec.reads && source in spec.reads ? (spec.reads[source] ?? null) : spec.value;
    return {
      source,
      model: source === "ocr" ? "image-ocr" : MODELS[source],
      value,
      evidence: { page, bbox: jitter(box, ...offsets[source]), text_seen: value ?? seen },
      ocr_confidence: source === "ocr" ? (spec.ocr ?? 97) : null,
    };
  });
  const triage = spec.triage ?? "green";
  return {
    name: spec.name,
    label: spec.label,
    value: spec.value,
    normalized: spec.normalized ?? null,
    reads,
    checks: spec.checks ?? [],
    confidence: spec.confidence ?? (triage === "green" ? 0.98 : triage === "yellow" ? 0.71 : 0.34),
    triage,
    reasons: spec.reasons ?? (triage === "green" ? ["All 4 readers agree; matches registry."] : []),
    risk: spec.risk ?? "normal",
    resolution: null,
  };
}

export interface Scenario {
  order: Order;
  fax: FaxSpec;
  /** What the prescriber's office says on a mock call, per field. */
  callAnswers: Record<string, string>;
}

interface ScenarioInput {
  id: string;
  minutesAgo: number;
  clinic: [name: string, phone: string, fax: string];
  values: Record<LineKey, string>;
  fields: FieldSpec[];
  smudged?: LineKey[];
  printed?: FaxSpec["printed"];
  controlled?: boolean;
  safety?: Order["safety_notices"];
  callAnswers?: Record<string, string>;
  seed?: number;
}

function scenario(input: ScenarioInput): Scenario {
  const fields: Order["fields"] = { patient: {}, drug: {}, sig: {}, prescriber: {}, meta: {} };
  for (const spec of input.fields) {
    fields[spec.group][spec.name] = buildField(spec, input.values[spec.line], 1);
  }
  const received = new Date(Date.now() - input.minutesAgo * 60_000).toISOString();
  const order = withRecount({
    order_id: `ord_${input.id}`,
    fax_id: `fax_${input.id}`,
    page: 1,
    page_count: 1,
    received_at: received,
    status: "needs_review",
    fields,
    counts: { red: 0, yellow: 0, green: 0 },
    trace_url: `https://app.blockconvey.com/traces/demo-${input.id}`,
    safety_notices: input.safety ?? [],
    active_call_id: null,
    audit: [{ at: received, actor: "system", action: "fax.received", detail: `Fax from ${input.clinic[2]}` }],
  });
  return {
    order,
    fax: {
      clinic: input.clinic[0],
      clinicPhone: input.clinic[1],
      clinicFax: input.clinic[2],
      values: input.values,
      smudged: input.smudged,
      printed: input.printed,
      controlled: input.controlled,
      seed: input.seed,
    },
    callAnswers: input.callAnswers ?? {},
  };
}

const pass = (rule: string, fields: string[], reason: string): Check => ({
  rule,
  result: "pass",
  severity: "info",
  fields,
  reason,
});

/** Standard field set; `over` patches individual fields by name. */
function standardFields(
  v: Record<LineKey, string>,
  extra: {
    rxcui: string;
    route: string;
    frequency: string;
    npi: string;
    over?: Record<string, Partial<FieldSpec>>;
  },
): FieldSpec[] {
  const base: FieldSpec[] = [
    {
      group: "patient",
      name: "patient.name",
      label: "Name",
      line: "patient.name",
      value: v["patient.name"],
      risk: "high",
    },
    {
      group: "patient",
      name: "patient.dob",
      label: "Date of birth",
      line: "patient.dob",
      value: v["patient.dob"],
      risk: "high",
    },
    {
      group: "patient",
      name: "patient.address",
      label: "Address",
      line: "patient.address",
      value: v["patient.address"],
    },
    {
      group: "drug",
      name: "drug.name",
      label: "Drug",
      line: "drug.name",
      value: v["drug.name"],
      risk: "high",
      normalized: { rxcui: extra.rxcui, tty: "IN" },
      checks: [pass("rxnorm_match", ["drug.name"], `Exact RxNorm match (RxCUI ${extra.rxcui}).`)],
    },
    {
      group: "drug",
      name: "drug.strength",
      label: "Strength",
      line: "drug.strength",
      value: v["drug.strength"],
      risk: "high",
      normalized: { value: parseFloat(v["drug.strength"]), unit: "mg" },
      checks: [pass("dose_range", ["drug.strength"], "Within the usual adult dose range.")],
    },
    { group: "drug", name: "drug.form", label: "Dosage form", line: "drug.form", value: v["drug.form"] },
    {
      group: "drug",
      name: "drug.quantity",
      label: "Quantity",
      line: "drug.quantity",
      value: v["drug.quantity"],
    },
    { group: "drug", name: "drug.refills", label: "Refills", line: "drug.refills", value: v["drug.refills"] },
    {
      group: "sig",
      name: "sig.text",
      label: "Directions",
      line: "sig.text",
      value: v["sig.text"],
      risk: "high",
    },
    {
      group: "sig",
      name: "sig.route",
      label: "Route",
      line: "sig.text",
      sub: extra.route,
      value: extra.route,
      normalized: { route: "PO" },
    },
    {
      group: "sig",
      name: "sig.frequency",
      label: "Frequency",
      line: "sig.text",
      sub: extra.frequency,
      value: extra.frequency,
    },
    {
      group: "sig",
      name: "sig.days_supply",
      label: "Days supply",
      line: "sig.days_supply",
      value: v["sig.days_supply"],
    },
    {
      group: "prescriber",
      name: "prescriber.name",
      label: "Name",
      line: "prescriber.name",
      value: v["prescriber.name"],
    },
    {
      group: "prescriber",
      name: "prescriber.npi",
      label: "NPI",
      line: "prescriber.npi",
      value: v["prescriber.npi"],
      normalized: {
        npi: extra.npi,
        registry_name: v["prescriber.name"].replace(/^Dr\.\s*/, "").toUpperCase(),
      },
      checks: [pass("npi_registry", ["prescriber.npi"], "NPI is active and matches the prescriber's name.")],
    },
    {
      group: "prescriber",
      name: "prescriber.dea",
      label: "DEA",
      line: "prescriber.dea",
      value: v["prescriber.dea"],
      checks: [pass("dea_checksum", ["prescriber.dea"], "DEA number checksum is valid.")],
    },
    {
      group: "prescriber",
      name: "prescriber.phone",
      label: "Office phone",
      line: "prescriber.phone",
      value: v["prescriber.phone"],
    },
    {
      group: "meta",
      name: "meta.date_written",
      label: "Date written",
      line: "meta.date_written",
      value: v["meta.date_written"],
    },
    {
      group: "meta",
      name: "meta.signature",
      label: "Signature",
      line: "meta.signature",
      value: "Present",
      reasons: ["Signature present; all 4 readers agree."],
    },
  ];
  return base.map((f) => ({ ...f, ...extra.over?.[f.name] }));
}

const RIVERSIDE: ScenarioInput["clinic"] = ["Riverside Family Medicine", "(212) 555-0142", "(212) 555-0143"];

const cleanValues = (o: Partial<Record<LineKey, string>> = {}): Record<LineKey, string> => ({
  "patient.name": "Jordan A. Reyes",
  "patient.dob": "04/12/1979",
  "patient.address": "418 W 118th St, New York NY",
  "drug.name": "Metformin HCl",
  "drug.strength": "500 mg",
  "drug.form": "Tablet",
  "drug.quantity": "60 (sixty)",
  "drug.refills": "3",
  "sig.text": "Take 1 tablet by mouth twice daily w/ meals",
  "sig.days_supply": "30",
  "prescriber.name": "Dr. Priya Shah",
  "prescriber.npi": "1234567893",
  "prescriber.dea": "AS1234563",
  "prescriber.phone": "(212) 555-0142",
  "meta.date_written": "10/09/2026",
  "meta.signature": "",
  ...o,
});

export function buildScenarios(): Scenario[] {
  const clean = scenario({
    id: "clean",
    minutesAgo: 4,
    clinic: RIVERSIDE,
    values: cleanValues(),
    fields: standardFields(cleanValues(), {
      rxcui: "6809",
      route: "by mouth",
      frequency: "twice daily",
      npi: "1234567893",
    }),
    seed: 2,
  });

  const smV = cleanValues({
    "patient.name": "Alicia M. Torres",
    "patient.dob": "11/03/1958",
    "patient.address": "77 Claremont Ave, New York NY",
    "drug.quantity": "90 (ninety)",
    "prescriber.name": "Dr. Samuel Okafor",
    "prescriber.npi": "1003000126",
    "prescriber.dea": "BO3456781",
    "prescriber.phone": "(646) 555-0187",
  });
  const smudged = scenario({
    id: "smudged",
    minutesAgo: 9,
    clinic: ["Harlem Internal Medicine", "(646) 555-0187", "(646) 555-0188"],
    values: smV,
    smudged: ["drug.strength"],
    seed: 11,
    fields: standardFields(smV, {
      rxcui: "6809",
      route: "by mouth",
      frequency: "twice daily",
      npi: "1003000126",
      over: {
        "drug.strength": {
          value: "850 mg",
          triage: "red",
          confidence: 0.31,
          ocr: 41,
          reads: { model_a: "850 mg", model_b: "850 mg", model_c: "500 mg", ocr: "850 mg" },
          reasons: [
            "2 of 3 model reads saw 850 mg, 1 saw 500 mg; OCR confidence 41%.",
            "First digit is smudged on the fax.",
          ],
          normalized: { value: 850, unit: "mg", rxcui_850: "861004", rxcui_500: "861007" },
          checks: [
            {
              rule: "reader_agreement",
              result: "fail",
              severity: "red",
              fields: ["drug.strength"],
              reason: "Readers disagree on a high-risk field (850 mg vs 500 mg).",
            },
            pass("dose_range", ["drug.strength"], "Both 500 mg and 850 mg are within the usual adult range."),
          ],
        },
        "drug.name": {
          triage: "yellow",
          confidence: 0.74,
          reasons: ["Look-alike/sound-alike pair: metFORMIN ↔ metroNIDAZOLE (ISMP list)."],
          checks: [
            {
              rule: "lasa",
              result: "warn",
              severity: "yellow",
              fields: ["drug.name"],
              reason:
                "metFORMIN is on the ISMP look-alike list with metroNIDAZOLE. Confirm the drug matches the indication.",
            },
            pass("rxnorm_match", ["drug.name"], "Exact RxNorm match (RxCUI 6809)."),
          ],
        },
        "sig.frequency": {
          triage: "yellow",
          confidence: 0.66,
          reasons: ["Days-supply mismatch: 90 tablets at twice daily is 45 days, but 30 days was written."],
          checks: [
            {
              rule: "days_supply",
              result: "warn",
              severity: "yellow",
              fields: ["sig.frequency", "drug.quantity", "sig.days_supply"],
              reason: "Quantity 90 ÷ (1 tablet × 2/day) = 45 days, which does not match the 30 days written.",
            },
          ],
        },
      },
    }),
    safety: [
      {
        title: "FDA: Metformin extended-release NDMA recall update",
        url: "https://www.fda.gov/drugs/drug-safety-and-availability",
        source: "fda.gov",
        date: "2026-08-14",
      },
    ],
    callAnswers: { "drug.strength": "500 mg", "drug.name": "Metformin HCl", "sig.frequency": "twice daily" },
  });

  const ctV = cleanValues({
    "patient.name": "Marcus L. Bennett",
    "patient.dob": "06/21/1990",
    "patient.address": "15 Morningside Dr, New York NY",
    "drug.name": "Oxycodone HCl",
    "drug.strength": "5 mg",
    "drug.quantity": "20 (twenty)",
    "drug.refills": "2",
    "sig.text": "Take 1 tablet by mouth every 6 hours prn pain",
    "sig.days_supply": "5",
    "prescriber.name": "Dr. Elena Park",
    "prescriber.npi": "1497758544",
    "prescriber.dea": "AP4567891",
    "prescriber.phone": "(917) 555-0110",
  });
  const controlled = scenario({
    id: "controlled",
    minutesAgo: 16,
    clinic: ["Columbia Ortho & Spine", "(917) 555-0110", "(917) 555-0111"],
    values: ctV,
    controlled: true,
    seed: 5,
    fields: standardFields(ctV, {
      rxcui: "7804",
      route: "by mouth",
      frequency: "every 6 hours",
      npi: "1497758544",
      over: {
        "drug.refills": {
          triage: "red",
          risk: "high",
          confidence: 0.97,
          reasons: ["Schedule II drugs cannot have refills (21 CFR 1306.12); 2 were written."],
          checks: [
            {
              rule: "cii_refills",
              result: "fail",
              severity: "red",
              fields: ["drug.refills", "drug.name"],
              reason: "Oxycodone is Schedule II. Federal law prohibits refills on CII prescriptions.",
            },
          ],
        },
        "prescriber.dea": {
          triage: "red",
          risk: "high",
          confidence: 0.95,
          reasons: ["DEA checksum fails: expected check digit 0, fax shows 1."],
          checks: [
            {
              rule: "dea_checksum",
              result: "fail",
              severity: "red",
              fields: ["prescriber.dea"],
              reason:
                "(4+6+8) + 2×(5+7+9) = 60, so the check digit should be 0; the fax shows 1. Misread or invalid DEA number.",
            },
          ],
        },
        "drug.name": {
          normalized: { rxcui: "7804", tty: "IN", schedule: "CII" },
          checks: [pass("rxnorm_match", ["drug.name"], "Exact RxNorm match (RxCUI 7804). DEA Schedule II.")],
        },
      },
    }),
    callAnswers: { "drug.refills": "0", "prescriber.dea": "AP4567890" },
  });

  const processing: Scenario = {
    order: {
      order_id: "ord_processing",
      fax_id: "fax_processing",
      page: 1,
      page_count: 1,
      received_at: new Date(Date.now() - 20_000).toISOString(),
      status: "processing",
      fields: { patient: {}, drug: {}, sig: {}, prescriber: {}, meta: {} },
      counts: { red: 0, yellow: 0, green: 0 },
      trace_url: null,
      safety_notices: [],
      active_call_id: null,
      audit: [],
    },
    fax: {
      clinic: "West Side Pediatrics",
      clinicPhone: "(212) 555-0190",
      clinicFax: "(212) 555-0191",
      values: {},
      seed: 8,
    },
    callAnswers: {},
  };

  const filler = (
    id: string,
    minutesAgo: number,
    o: Partial<Record<LineKey, string>>,
    rxcui: string,
    frequency: string,
  ) => {
    const v = cleanValues(o);
    return scenario({
      id,
      minutesAgo,
      clinic: RIVERSIDE,
      values: v,
      fields: standardFields(v, { rxcui, route: "by mouth", frequency, npi: "1234567893" }),
      seed: minutesAgo,
    });
  };

  return [
    clean,
    smudged,
    controlled,
    processing,
    filler(
      "lisinopril",
      31,
      {
        "patient.name": "Grace H. Liu",
        "drug.name": "Lisinopril",
        "drug.strength": "10 mg",
        "drug.quantity": "30 (thirty)",
        "sig.text": "Take 1 tablet by mouth once daily",
        "drug.refills": "5",
      },
      "29046",
      "once daily",
    ),
    filler(
      "atorvastatin",
      44,
      {
        "patient.name": "Omar K. Haddad",
        "drug.name": "Atorvastatin",
        "drug.strength": "20 mg",
        "drug.quantity": "30 (thirty)",
        "sig.text": "Take 1 tablet by mouth at bedtime",
        "drug.refills": "11",
      },
      "83367",
      "at bedtime",
    ),
  ];
}
