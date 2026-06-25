/** Standard NPD schedule template — parent headers with child tasks. */

export interface DefaultPhaseGroup {
  name: string;
  children: string[];
}

export const DEFAULT_PHASE_GROUPS: DefaultPhaseGroup[] = [
  {
    name: "Formula Development",
    children: [
      "NPD Confirmation",
      "Stability Test",
      "BPOM Registration",
    ],
  },
  {
    name: "Primary Packaging Development",
    children: [
      "Model Locked",
      "Compatibility Test",
      "Draft Artwork",
      "Design for Final Artwork",
      "PPS Production",
      "PPS Shipment",
      "PPS Review & Approval",
      "PO Submission",
      "Mass Production",
      "Sea Shipment",
      "Customs",
      "Inbound",
    ],
  },
  {
    name: "Secondary Packaging Development",
    children: [
      "Sizing & Share Technical Drawing",
      "Draft Artwork",
      "Design for Final Artwork",
      "PPS Production",
      "PPS Review & Approval",
      "PO Submission",
      "Mass Production",
      "Inbound",
    ],
  },
  {
    name: "Finish Good Production",
    children: [
      "PO Submission for Extract",
      "Extract Readiness",
      "PO Submission for FG",
      "Mass Production",
      "FG Readiness",
    ],
  },
];
