# ClearScript Demo Runbook

This runbook is for the Person 3 backend/demo workstream: prescriber calls, FHIR output, contract checks, and the demo-safe seed path.

## Pre-flight

- Confirm the API contract passes: `python scripts/check_contract.py --spec-only`
- Set `DEMO_MODE=1` and keep `CALL_PROVIDER=simulated` unless the team is explicitly rehearsing a live phone call.
- If a live call is needed, set `CALL_DEMO_TO_NUMBER` to the stage phone. Demo mode must never dial a real prescriber office.
- Confirm the stage phone is charged, loud, unlocked, and on both Wi-Fi and cellular fallback.
- Confirm the ElevenLabs agent says the call may be recorded and asks only the scoped field question.
- Confirm the web console is in live mode only after the backend routes are mounted; otherwise use mock mode.

## Five-minute script

1. Show the naive-output failure: the smudged strength would silently ship wrong.
2. Upload or open the clean fax. Show that every value is tied to a fax box, then approve and display FHIR.
3. Open the smudged fax. Show the strength disagreement, crop evidence, and safety reason.
4. Start the prescriber call for `drug.strength`. Let the transcript stream, accept the structured answer, then approve.
5. Open metrics: compare silent error rate against naive, then open the trace link for the approved order.

## Failure playbook

- Live call fails: retry once with the simulated provider and explain the same backend state machine is used.
- Phone signal fails: play the recorded backup clip and continue with the completed call fixture.
- Backend is unavailable: switch the console to mock mode and continue the product demo.
- Contract mismatch appears: stop integration work and fix either the implementation or `contracts/openapi.yaml` in a reviewed PR.

## Research notes for Q&A

- The voice agent is scoped to one question to reduce clinical and privacy risk.
- Read-back confirmation is required because verbal medication clarification needs a closed loop.
- A value not present on the fax stays red until a pharmacist explicitly edits or accepts it.
- FHIR R4 plus Provenance makes the verification chain auditable: fax, reads, human review, prescriber clarification, approval.
