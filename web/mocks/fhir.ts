import type { Order } from "@/lib/api/types";

/** Minimal FHIR R4 Bundle for the mock approve flow (the real one comes from pipeline/output). */
export function mockFhir(order: Order, approvedAt: string) {
  const v = (g: keyof Order["fields"], n: string) => order.fields[g][n]?.value ?? undefined;
  const rxcui = order.fields.drug["drug.name"]?.normalized?.rxcui as string | undefined;
  const [given, ...rest] = (v("patient", "patient.name") ?? "").split(" ");
  return {
    resourceType: "Bundle",
    type: "collection",
    timestamp: approvedAt,
    entry: [
      {
        fullUrl: "urn:uuid:patient-1",
        resource: {
          resourceType: "Patient",
          name: [{ given: given ? [given] : [], family: rest.at(-1) }],
          birthDate: v("patient", "patient.dob")?.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2"),
        },
      },
      {
        fullUrl: "urn:uuid:practitioner-1",
        resource: {
          resourceType: "Practitioner",
          identifier: [
            { system: "http://hl7.org/fhir/sid/us-npi", value: v("prescriber", "prescriber.npi") },
          ],
          name: [{ text: v("prescriber", "prescriber.name") }],
        },
      },
      {
        fullUrl: "urn:uuid:medreq-1",
        resource: {
          resourceType: "MedicationRequest",
          status: "active",
          intent: "order",
          subject: { reference: "urn:uuid:patient-1" },
          requester: { reference: "urn:uuid:practitioner-1" },
          authoredOn: v("meta", "meta.date_written")?.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2"),
          medicationCodeableConcept: {
            coding: rxcui ? [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: rxcui }] : [],
            text: [v("drug", "drug.name"), v("drug", "drug.strength"), v("drug", "drug.form")]
              .filter(Boolean)
              .join(" "),
          },
          dosageInstruction: [{ text: v("sig", "sig.text"), route: { text: v("sig", "sig.route") } }],
          dispenseRequest: {
            quantity: { value: parseInt(v("drug", "drug.quantity") ?? "0", 10) },
            numberOfRepeatsAllowed: parseInt(v("drug", "drug.refills") ?? "0", 10),
            expectedSupplyDuration: { value: parseInt(v("sig", "sig.days_supply") ?? "0", 10), unit: "days" },
          },
        },
      },
    ],
  };
}
