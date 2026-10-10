import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent, renderHook } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TriageBadge } from "@/components/fields/TriageBadge";
import { FieldDrawer } from "@/components/fields/FieldDrawer";
import { ApproveBar } from "@/components/order/ApproveBar";
import { CallPanel } from "@/components/call/CallPanel";
import { validateFax } from "@/components/queue/UploadDialog";
import { useHotkeys } from "@/lib/keyboard";
import { applyResolution, findField } from "@/lib/order";
import { buildScenarios } from "@/mocks/fixtures/orders";
import type { Call, CallStatus, Order } from "@/lib/api/types";

const scen = () =>
  Object.fromEntries(buildScenarios().map((s) => [s.order.order_id, s.order])) as Record<string, Order>;
const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("TriageBadge", () => {
  it.each([
    ["red", "Blocks approval", "Blocking"],
    ["yellow", "Check", "Check"],
    ["green", "Verified", "Verified"],
  ] as const)("%s shows an icon and words, never color alone", (triage, label, short) => {
    const { container, rerender } = render(<TriageBadge triage={triage} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    rerender(<TriageBadge triage={triage} compact />);
    expect(screen.getByText(short)).toBeInTheDocument();
  });
});

describe("FieldDrawer", () => {
  const order = scen().ord_smudged!;
  const field = findField(order, "drug.strength")!.field;
  const props = {
    open: true,
    order,
    field,
    pageSrc: "http://localhost:8000/faxes/fax_smudged/pages/1.png",
    mode: "view" as const,
    onModeChange: vi.fn(),
    onClose: vi.fn(),
    onAccept: vi.fn(),
    onEdit: vi.fn(),
    resolving: false,
    call: null,
    callBlocked: null,
    starting: false,
    deciding: false,
    onStartCall: vi.fn(),
    onDecide: vi.fn(),
  };

  it("highlights only the reads that disagree with the majority", () => {
    wrap(<FieldDrawer {...props} />);
    const rows = within(screen.getByTestId("reads-table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const flagged = rows
      .filter((r) => r.hasAttribute("data-disagrees"))
      .map((r) => r.getAttribute("data-source"));
    expect(flagged).toEqual(["model_c"]);
  });

  it("shows checks verbatim and offers a call for flagged fields", () => {
    wrap(<FieldDrawer {...props} />);
    expect(screen.getByText("Readers disagree on a high-risk field (850 mg vs 500 mg).")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-prescriber"));
    expect(props.onModeChange).toHaveBeenCalledWith("call");
  });

  it("submits an edit", () => {
    wrap(<FieldDrawer {...props} mode="edit" />);
    const input = screen.getByLabelText("Correct value");
    fireEvent.change(input, { target: { value: "500 mg" } });
    fireEvent.submit(input.closest("form")!);
    expect(props.onEdit).toHaveBeenCalledWith("500 mg");
  });

  it("hides the call action on verified fields", () => {
    wrap(<FieldDrawer {...props} field={findField(order, "drug.form")!.field} />);
    expect(screen.queryByTestId("call-prescriber")).toBeNull();
    expect(screen.getByTestId("accept-field")).toBeDisabled();
  });
});

describe("ApproveBar", () => {
  const base = {
    approving: false,
    rejecting: false,
    confirmOpen: false,
    onConfirmOpenChange: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    serverBlocked: null,
    onJumpTo: vi.fn(),
  };
  it("is disabled while any field is red", () => {
    wrap(<ApproveBar {...base} order={scen().ord_smudged!} />);
    expect(screen.getByTestId("approve")).toBeDisabled();
    expect(screen.getByText("1 blocking field left.")).toBeInTheDocument();
  });
  it("enables once red fields are resolved (yellow doesn't block)", () => {
    const o = applyResolution(scen().ord_smudged!, "drug.strength", { action: "edit", value: "500 mg" });
    wrap(<ApproveBar {...base} order={o} />);
    expect(screen.getByTestId("approve")).toBeEnabled();
  });
  it("is disabled for approved orders", () => {
    wrap(<ApproveBar {...base} order={{ ...scen().ord_clean!, status: "approved" }} />);
    expect(screen.getByTestId("approve")).toBeDisabled();
  });
  it("lists server-blocked fields with jump links", () => {
    wrap(<ApproveBar {...base} order={scen().ord_smudged!} serverBlocked={["drug.strength"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Strength" }));
    expect(base.onJumpTo).toHaveBeenCalledWith("drug.strength");
  });
});

describe("CallPanel", () => {
  const order = scen().ord_smudged!;
  const field = findField(order, "drug.strength")!.field;
  const mkCall = (status: CallStatus, extra: Partial<Call> = {}): Call => ({
    call_id: "c1",
    order_id: order.order_id,
    field_name: field.name,
    status,
    to_number: "+1 (646) 555-0187",
    number_source: { kind: "npi_registry", detail: "matches", agreement: true },
    question: "q?",
    transcript: status === "queued" || status === "dialing" ? [] : [{ role: "agent", text: "Hello", t: 1 }],
    result:
      status === "completed"
        ? { outcome: "confirmed", confirmed_value: "500 mg", confirmed_by: "Maria, front desk", notes: null }
        : null,
    decision: null,
    started_at: status === "queued" ? null : new Date().toISOString(),
    ended_at: null,
    error: status === "failed" ? "Carrier rejected the call" : null,
    ...extra,
  });
  const props = {
    order,
    field,
    starting: false,
    deciding: false,
    onStart: vi.fn(),
    onDecide: vi.fn(),
    onResolveManually: vi.fn(),
    onCancel: vi.fn(),
  };

  it("shows a confirm card before dialing, with masked number and initials-only question", () => {
    render(<CallPanel {...props} call={null} />);
    const card = screen.getByTestId("precall");
    expect(card).toHaveTextContent("(•••) •••-0187");
    expect(card).toHaveTextContent("A.M.T.");
    expect(card).not.toHaveTextContent("Torres");
    expect(card).toHaveTextContent("Shares patient initials only. Call may be recorded.");
    expect(props.onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start call/i }));
    expect(props.onStart).toHaveBeenCalledOnce();
  });

  it.each(["queued", "dialing", "in_progress", "completed", "no_answer", "failed"] as const)(
    "renders %s",
    (status) => {
      render(<CallPanel {...props} call={mkCall(status)} />);
      expect(screen.getByTestId("call-panel")).toHaveAttribute("data-status", status);
      if (status === "completed") {
        expect(screen.getByText("500 mg")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Accept answer" }));
        expect(props.onDecide).toHaveBeenCalledWith("accept");
      }
      if (status === "no_answer" || status === "failed") {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /retry call/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /resolve manually/i })).toBeInTheDocument();
      }
      if (status === "failed") expect(screen.getByText("Carrier rejected the call")).toBeInTheDocument();
    },
  );

  it("warns when number sources disagree", () => {
    render(
      <CallPanel
        {...props}
        call={mkCall("dialing", { number_source: { kind: "tavily", detail: "x", agreement: false } })}
      />,
    );
    expect(screen.getByText(/sources disagree/)).toBeInTheDocument();
  });
});

describe("useHotkeys", () => {
  it("fires on keydown and ignores keys typed into inputs", () => {
    const j = vi.fn();
    const approve = vi.fn();
    renderHook(() => useHotkeys({ j, "mod+Enter": approve }));
    fireEvent.keyDown(window, { key: "j" });
    expect(j).toHaveBeenCalledOnce();
    const input = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(input, { key: "j" });
    expect(j).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(approve).toHaveBeenCalledOnce();
    input.remove();
  });
});

describe("validateFax", () => {
  it("accepts pdf/tiff/png up to 20 MB", () => {
    expect(validateFax({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(validateFax({ name: "a.TIF", type: "", size: 1000 })).toBeNull();
    expect(validateFax({ name: "a.docx", type: "application/msword", size: 10 })).toMatch(/PDF, TIFF or PNG/);
    expect(validateFax({ name: "a.png", type: "image/png", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });
});
