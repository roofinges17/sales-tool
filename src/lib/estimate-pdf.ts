import { jsPDF } from "jspdf";

const LOGO_DATA_URL = "data:image/png;base64,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";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PdfSection {
  sectionType: "FLAT" | "SLOPED";
  productCode: string; // METAL | FLAT | ALUMINUM | SHINGLE | TILE | etc.
  areaSqft: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PdfEstimateInput {
  estimateNumber: string;         // e.g. "M20260423-00001"
  date: string;                   // ISO date string
  customerName: string;
  propertyAddress: string;
  shipToAddress?: string;
  folioNumber?: string;
  subtotal: number;
  sections: PdfSection[];
  termsAndConditions?: string;
  visualizationImageDataUrl?: string;
  visualizationColorName?: string;
  beforePhotos?: string[];        // base64 data URLs, up to 6 BEFORE-stage photos
  // Optional company overrides from company_settings (if not provided, falls back to hardcoded defaults)
  companyName?: string;
  companyLicenseNumber?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
}

// ── Constants (fallback defaults) ─────────────────────────────────────────────

const DEFAULT_COMPANY_NAME    = "Roofing Experts Services Inc";
const DEFAULT_LICENSE_NUMBER  = "CCC1331656";
const DEFAULT_COMPANY_ADDR1   = "17587 Homestead Ave";
const DEFAULT_COMPANY_ADDR2   = "Miami, FL 33157 US";
const DEFAULT_COMPANY_PHONE   = "+17867189593";
const DEFAULT_COMPANY_EMAIL   = "roofinges@gmail.com";
const CONTACT_LINE    = "Alejandro Perez-Madrid / 786-718-9593 / roofinges@gmail.com";

const MARGIN = 18;
const PAGE_W = 210; // A4 mm
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

// ── Activity block builders ───────────────────────────────────────────────────

function metalActivity(section: PdfSection): string[] {
  const sf = Math.round(section.areaSqft);
  return [
    `ACTIVITY: PROJECT METAL RE-ROOFING | NEW METAL INSTALLATION SYSTEM`,
    `DESCRIPTION:`,
    `  Slope Roof Size: ${sf} SF`,
    `  Price: ${fmt(section.lineTotal)}`,
    ``,
    `  1) Pull the appropriate roofing package permit for Miami-Dade County.`,
    `  2) Register a Notice of Commencement for the State of Florida, Miami-Dade County Records.`,
    `  3) Tear off the existing roof system and pick it up at the recycling center.`,
    `  4) Replace rotten wood, and three (3) sheets of plywood or twenty (20) tongues and grooves are included in the`,
    `     contract price. (No Fascia-Soffit)`,
    `  5) Install a Polystick XFR self-adhered waterproofing underlayment.`,
    `  6) Install new 24 ga. galvalume bullnoses, 24 ga. galvalume Z-bar, flashing, and 24 ga. galvalume stucco stops.`,
    `  7) Install 24 ga. galvalume valley, valley cleat, ridge, and hip metal.`,
    `  8) Replace lead boots, roof vents, and goosenecks.`,
    `  9) Install Metal Roof Panel: REM 1.5 Clip (NOA # 22-1208.01: Roofing Experts Services Inc.)`,
    ` 10) All work to be done accordingly to the Florida Building Code Compliance`,
    ` 11) A twenty-five (25)-year warranty against leaks.`,
    ` 12) Pick up all debris from the premises.`,
  ];
}

function aluminumActivity(section: PdfSection): string[] {
  const sf = Math.round(section.areaSqft);
  return [
    `ACTIVITY: PROJECT ALUMINUM RE-ROOFING | NEW ALUMINUM INSTALLATION SYSTEM`,
    `DESCRIPTION:`,
    `  Slope Roof Size: ${sf} SF`,
    `  Price: ${fmt(section.lineTotal)}`,
    ``,
    `  1) Pull the appropriate roofing package permit for Miami-Dade County.`,
    `  2) Register a Notice of Commencement for the State of Florida, Miami-Dade County Records.`,
    `  3) Tear off the existing roof system and pick it up at the recycling center.`,
    `  4) Replace rotten wood, and three (3) sheets of plywood or twenty (20) tongues and grooves are included in the`,
    `     contract price. (No Fascia-Soffit)`,
    `  5) Install a Polystick XFR self-adhered waterproofing underlayment.`,
    `  6) Install new 24 ga. galvalume bullnoses, 24 ga. galvalume Z-bar, flashing, and 24 ga. galvalume stucco stops.`,
    `  7) Install 24 ga. galvalume valley, valley cleat, ridge, and hip metal.`,
    `  8) Replace lead boots, roof vents, and goosenecks.`,
    `  9) Install aluminum standing-seam roof panels: 24 ga. structural aluminum clip system (NOA # 22-1208.01: Roofing Experts Services Inc.)`,
    ` 10) All work to be done accordingly to the Florida Building Code Compliance`,
    ` 11) A twenty-five (25)-year warranty against leaks.`,
    ` 12) Pick up all debris from the premises.`,
  ];
}

function shingleActivity(section: PdfSection): string[] {
  const sf = Math.round(section.areaSqft);
  return [
    `ACTIVITY: PROJECT SHINGLE RE-ROOFING | NEW SHINGLE INSTALLATION SYSTEM`,
    `DESCRIPTION:`,
    `  Slope Roof Size: ${sf} SF`,
    `  Price: ${fmt(section.lineTotal)}`,
    ``,
    `  1) Pull the appropriate roofing package permit for Miami-Dade County.`,
    `  2) Register a Notice of Commencement for the State of Florida, Miami-Dade County Records.`,
    `  3) Tear off the existing roof system and pick it up at the recycling center.`,
    `  4) Replace rotten wood, and three (3) sheets of plywood or twenty (20) tongues and grooves are included in the`,
    `     contract price. (No Fascia-Soffit)`,
    `  5) Install a Polystick XFR self-adhered waterproofing underlayment.`,
    `  6) Install new 24 ga. galvalume bullnoses, 24 ga. galvalume Z-bar, flashing, and 24 ga. galvalume stucco stops.`,
    `  7) Install 24 ga. galvalume valley, valley cleat, ridge, and hip metal.`,
    `  8) Replace lead boots, roof vents, and goosenecks.`,
    `  9) Install Class 4 impact-resistant architectural asphalt shingles (Miami-Dade NOA approved). Include ice-and-water shield at eaves and valleys.`,
    ` 10) All work to be done accordingly to the Florida Building Code Compliance`,
    ` 11) A twenty-five (25)-year warranty against leaks.`,
    ` 12) Pick up all debris from the premises.`,
  ];
}

function tileActivity(section: PdfSection): string[] {
  const sf = Math.round(section.areaSqft);
  return [
    `ACTIVITY: PROJECT TILE RE-ROOFING | NEW TILE INSTALLATION SYSTEM`,
    `DESCRIPTION:`,
    `  Slope Roof Size: ${sf} SF`,
    `  Price: ${fmt(section.lineTotal)}`,
    ``,
    `  1) Pull the appropriate roofing package permit for Miami-Dade County.`,
    `  2) Register a Notice of Commencement for the State of Florida, Miami-Dade County Records.`,
    `  3) Tear off the existing roof system and pick it up at the recycling center.`,
    `  4) Replace rotten wood, and three (3) sheets of plywood or twenty (20) tongues and grooves are included in the`,
    `     contract price. (No Fascia-Soffit)`,
    `  5) Install a Polystick XFR self-adhered waterproofing underlayment.`,
    `  6) Install new 24 ga. galvalume bullnoses, 24 ga. galvalume Z-bar, flashing, and 24 ga. galvalume stucco stops.`,
    `  7) Install 24 ga. galvalume valley, valley cleat, ridge, and hip metal.`,
    `  8) Replace lead boots, roof vents, and goosenecks.`,
    `  9) Install concrete or clay roof tiles (Miami-Dade NOA approved), set with foam adhesive per manufacturer specification.`,
    ` 10) All work to be done accordingly to the Florida Building Code Compliance`,
    ` 11) A twenty-five (25)-year warranty against leaks.`,
    ` 12) Pick up all debris from the premises.`,
  ];
}

function flatActivity(section: PdfSection): string[] {
  const sf = Math.round(section.areaSqft);
  return [
    `ACTIVITY: RE-ROOF NEW FLAT INSTALLATION SYSTEM`,
    `DESCRIPTION:`,
    `  FLAT ROOF: ${sf} SF`,
    `  Price: ${fmt(section.lineTotal)}`,
    ``,
    `  Modified Bitumen`,
    `  1) Tear off the existing roof system and pick it up at the recycling center.`,
    `  2) Replace rotten wood; three sheets of plywood or 20 pieces of tongue and groove are included in the contract price.`,
    `  3) Install GAF GAFGLAS #75 Glass Base Sheet 3 SQ., nailed with 3/4" ring-shanked nails at 12" center to center and 4" at`,
    `     the eave, and lap the flat area over 3/4" CDX plywood with staggered joints nailed with 8dx 3" ring-shanked nails 8" 6" O.C.`,
    `  4) Install GAF RUBEROID 20 Smooth 1.5 SQ hot mopped over GAF GAFGLAS #75 Glass Base Sheet 3 SQ Felt lapped two inches`,
    `     and turned up vertical surfaces a minimum of 4".`,
    `  5) Install GAF RUBEROID MOP GRAN WHITE 1 SQ (CAP SHEET) hot-mopped over GAF RUBEROID 20 Smooth 1.5 SQ lapped two`,
    `     inches and turned up vertical surfaces a minimum of 4".`,
    `  6) All work is to be done according to Florida Building Code compliance.`,
    `  7) A ten (10)-year warranty against leaks.`,
    `  8) Pick up all debris from the premises.`,
  ];
}

function activityLines(section: PdfSection): string[] {
  const code = section.productCode.toUpperCase();
  if (section.sectionType === "FLAT" || code.startsWith("FLAT")) return flatActivity(section);
  if (code === "ALUMINUM") return aluminumActivity(section);
  if (code === "SHINGLE") return shingleActivity(section);
  if (code === "TILE") return tileActivity(section);
  return metalActivity(section); // METAL + default
}

const STANDARD_NOTES = [
  "1) We reserve the right to subcontract any part of the labor herein proposed.",
  "2) Roofing Experts Services Inc. will take care of requesting all the pertinent roofing inspections.",
  "3) When the job is impacted by inclement weather or acts of God above and beyond the control of the contractor, the first option is at the contractor's judgment to resolve it before calling another contractor.",
  "4) Polystick XFR self-adhered waterproofing underlayment can only be exposed for approximately six (6) months (county regulations). After the specified time frame, another roll of Polystick XFR self-adhered waterproofing underlayment needs to be replaced. This will be at the owner's expense if the installation delays are not caused by Roofing Experts Services Inc. but by the owner.",
  "5) Roofing Experts Services Inc. reserves the right to close the roofing permit under its name when the owner creates unnecessary delays (monetary) that may hinder the scheduled roofing process.",
  "6) The contract price includes tearing off (2) two layers of underlayment tin tagged onto the roof deck. If there is more than one layer of paper or more than one existing roof underneath, there will be an additional charge to be settled while the roofing process is taking place and must be completed in writing.",
  "7) This contract does not include carpentry work of any kind other than the one specified above.",
  "8) The owner and contractor agree that the work area is dangerous and that only personnel approved by the contractor are allowed in the work area while the job is in progress. The owner's, the owner's contractor's, and the associates' access to the work area is their sole risk and expense.",
  "9) Contractor shall not be held accountable in any manner for preexistent damage to any area of the home prior to commencing the job, including but not limited to driveways, sidewalks, windows, landscaping, and lawns.",
  "10) We cannot accept responsibility for any damages done to the roof by plumbers, electricians, air conditioning men, cable men, fumigators, or any other tradesmen during the roof work installation or done after its completion.",
  "11) This contract does not include the removal and reinstallation of gas vent units, (*) gutters, screens, solar panels or the like, antennas, air conditioning units, satellite dishes, water heaters, or any object that may be attached to the roof in any way.",
  "12) In the event of existing gas vent units, the homeowner will be responsible for contracting a plumbing company to do the work without delaying the roofing progress.",
  "13) Roofing Experts Services Inc. runs the Miami-Dade County permits for approval.",
  "14) Roofing Experts Services Inc. will pay the permit fees of Miami-Dade County.",
  "15) The roof warranty will be effective once the final payment is made.",
];

// ── PDF builder ───────────────────────────────────────────────────────────────

export function generateEstimatePdf(input: PdfEstimateInput): jsPDF {
  const doc = new jsPDF("p", "mm", "a4");
  const pageH = 297; // A4 mm
  const footerH = 16;
  const headerH = 36;
  const bodyTop = headerH + 4;
  const bodyBottom = pageH - footerH - 4;

  let page = 1;
  let y = bodyTop;

  // Resolve company fields from input or fall back to hardcoded defaults
  const companyDisplayName = (() => {
    if (input.companyName) {
      const license = input.companyLicenseNumber || DEFAULT_LICENSE_NUMBER;
      return `${input.companyName}  ${license}`;
    }
    return `${DEFAULT_COMPANY_NAME}  ${DEFAULT_LICENSE_NUMBER}`;
  })();
  const [companyAddr1, companyAddr2] = (() => {
    if (input.companyAddress) {
      const parts = input.companyAddress.split(",").map((s) => s.trim());
      return [parts[0] ?? input.companyAddress, parts.slice(1).join(", ") || ""];
    }
    return [DEFAULT_COMPANY_ADDR1, DEFAULT_COMPANY_ADDR2];
  })();
  const companyPhone = input.companyPhone || DEFAULT_COMPANY_PHONE;
  const companyEmail = input.companyEmail || DEFAULT_COMPANY_EMAIL;

  function addHeader() {
    // Real logo (702x242 px, aspect 2.9:1 → 44mm x 15mm)
    doc.addImage(LOGO_DATA_URL, "PNG", MARGIN, 4, 44, 15);

    // Company info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 15, 15);
    doc.text(companyDisplayName, MARGIN + 48, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(companyAddr1, MARGIN + 48, 14.5);
    if (companyAddr2) doc.text(companyAddr2, MARGIN + 48, 18.5);
    doc.text(companyPhone, MARGIN + 48, companyAddr2 ? 22.5 : 18.5);
    doc.text(companyEmail, MARGIN + 48, companyAddr2 ? 26.5 : 22.5);

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, headerH, PAGE_W - MARGIN, headerH);

    // Page number (top right)
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Page ${page}`, PAGE_W - MARGIN, 10, { align: "right" });
  }

  function addFooter() {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, pageH - footerH, PAGE_W - MARGIN, pageH - footerH);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("If you have any questions, please contact:", PAGE_W / 2, pageH - footerH + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.text(CONTACT_LINE, PAGE_W / 2, pageH - footerH + 9, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.text("Thank You For Your Business!", PAGE_W / 2, pageH - footerH + 13, { align: "center" });
    doc.setFont("helvetica", "normal");
  }

  function newPage() {
    addFooter();
    doc.addPage();
    page++;
    y = bodyTop;
    addHeader();
  }

  function checkY(needed: number) {
    if (y + needed > bodyBottom) newPage();
  }

  function writeLine(text: string, fontSize = 8, bold = false, color: [number, number, number] = [20, 20, 20]) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    checkY(lines.length * (fontSize * 0.4));
    doc.text(lines, MARGIN, y);
    y += lines.length * (fontSize * 0.4) + 0.5;
  }

  function gap(mm = 3) {
    y += mm;
  }

  // ── Page 1 ────────────────────────────────────────────────────────────────
  addHeader();

  // Metadata block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  const metaLeft = MARGIN;
  const metaRight = PAGE_W - MARGIN - 70;

  // Left column
  doc.text("ADDRESS:", metaLeft, y);
  doc.setFont("helvetica", "normal");
  const addrLines = doc.splitTextToSize(input.propertyAddress, 80) as string[];
  doc.text(addrLines, metaLeft + 22, y);

  // Right column
  doc.setFont("helvetica", "bold");
  doc.text("ESTIMATE #:", metaRight, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.estimateNumber, metaRight + 26, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("SHIP TO:", metaLeft, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.shipToAddress ?? input.propertyAddress, metaLeft + 22, y);

  doc.setFont("helvetica", "bold");
  doc.text("DATE:", metaRight, y);
  doc.setFont("helvetica", "normal");
  doc.text(fmtDate(input.date), metaRight + 26, y);
  y += 5;

  if (input.folioNumber) {
    doc.setFont("helvetica", "bold");
    doc.text("FOLIO #:", metaLeft, y);
    doc.setFont("helvetica", "normal");
    doc.text(input.folioNumber, metaLeft + 22, y);
    y += 5;
  }

  gap(4);

  // Visualization page (before scope pages, when a roof color render is available)
  if (input.visualizationImageDataUrl) {
    newPage();
    const imgW = CONTENT_W;
    const imgH = 150;
    doc.addImage(input.visualizationImageDataUrl, "PNG", MARGIN, y, imgW, imgH);
    y += imgH + 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(
      `Selected Roof Color: ${input.visualizationColorName ?? ""}`,
      PAGE_W / 2,
      y,
      { align: "center" }
    );
    y += 6;
    newPage();
  }

  // Activity rows (one per section)
  for (const section of input.sections) {
    checkY(10);
    const lines = activityLines(section);
    for (const line of lines) {
      const isHeader = line.startsWith("ACTIVITY:");
      const isBold = isHeader || line.startsWith("DESCRIPTION:");
      writeLine(line, isHeader ? 8.5 : 7.5, isBold);
    }
    gap(5);
  }

  // Standard notes
  checkY(8);
  writeLine("Notes:", 8, true);
  gap(1);
  for (const note of STANDARD_NOTES) {
    checkY(6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(40, 40, 40);
    const wrapped = doc.splitTextToSize(`  ${note}`, CONTENT_W) as string[];
    checkY(wrapped.length * 3);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 3 + 0.5;
  }
  gap(5);

  // Delinquent payments
  checkY(20);
  writeLine("DELINQUENT PAYMENTS, ATTORNEY FEES AND INTEREST:", 8, true);
  writeLine("1) In the event the OWNER fails to make payments when due as specified herein.", 7.5);
  writeLine("2) Then the owner (if applicable) shall pay, in addition to all other sums payable hereunder, the reasonable costs and expenses incurred by Roofing Experts Services Inc. in connection with all actions taken to enforce collection or to preserve and protect it under the contract, whether by legal proceedings or otherwise, including without limitation attorney's fees and court costs. In addition, the owner shall be reasonably responsible for the interest at a rate of one and a half percent (1-1/2%) per month on the amount of any unmade payment.", 7.5);
  gap(4);

  // Confidentiality
  checkY(16);
  writeLine("THIS INFORMATION IS CONFIDENTIAL:", 8, true);
  writeLine("This information is confidential, privileged, or exempt from disclosure under applicable federal or state law.", 7.5);
  writeLine("This proposal/contract may be withdrawn after thirty (30) days if the conditions of this proposal/contract as outlined above are not met. Roofing Experts Services Inc., is hereby authorized to do the work as specified.", 7.5);
  gap(5);

  // Payment schedule
  checkY(40);
  writeLine("PAYMENT SCHEDULE:", 8, true);
  gap(1);
  const pmtRows: [string, string][] = [
    [`FIRST PAYMENT:   First day of the Project (30%)`, fmt(input.subtotal * 0.30)],
    [`SECOND PAYMENT:  Tin-Cap (30%)`, fmt(input.subtotal * 0.30)],
    [`THIRD PAYMENT:   In Progress Inspection (30%)`, fmt(input.subtotal * 0.30)],
    [`FINAL PAYMENT:   Final Inspection (10%)`, fmt(input.subtotal * 0.10)],
  ];
  for (const [label, amount] of pmtRows) {
    checkY(5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(label, MARGIN, y);
    doc.text(amount, PAGE_W - MARGIN, y, { align: "right" });
    y += 5;
  }
  gap(2);
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  gap(2);

  const summaryRows: [string, string, boolean][] = [
    ["SUBTOTAL:", fmt(input.subtotal), false],
    ["TAX:", "$0.00", false],
    ["TOTAL:", fmt(input.subtotal), true],
  ];
  for (const [label, amount, bold] of summaryRows) {
    checkY(5);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 9 : 8);
    doc.setTextColor(20, 20, 20);
    doc.text(label, MARGIN, y);
    if (bold) doc.setTextColor(204, 42, 46);
    doc.text(amount, PAGE_W - MARGIN, y, { align: "right" });
    doc.setTextColor(20, 20, 20);
    y += 5;
  }
  gap(8);

  // Acceptance
  checkY(12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text("Accepted By:", MARGIN, y);
  doc.line(MARGIN + 30, y, MARGIN + 100, y);
  doc.text("Accepted Date:", MARGIN + 110, y);
  doc.line(MARGIN + 138, y, PAGE_W - MARGIN, y);

  // Job Documentation page — BEFORE photos, up to 6 in a 2-col grid
  if (input.beforePhotos && input.beforePhotos.length > 0) {
    newPage();

    // Section heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text("Job Documentation — Before Photos", MARGIN, y);
    y += 7;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 5;

    const cols = 2;
    const imgW = (CONTENT_W - 4) / cols; // 4 mm gutter total
    const imgH = imgW * 0.75;            // 4:3 aspect
    const colGap = 4;

    input.beforePhotos.slice(0, 6).forEach((dataUrl, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      if (col === 0 && row > 0) {
        y += imgH + 4;
        checkY(imgH + 4);
      }

      const x = MARGIN + col * (imgW + colGap);
      const rowY = y + (col === 0 ? 0 : 0); // same y for both columns in a row

      try {
        doc.addImage(dataUrl, "JPEG", x, rowY, imgW, imgH);
      } catch {
        // If image format detection fails, skip gracefully
        doc.setFillColor(230, 230, 230);
        doc.rect(x, rowY, imgW, imgH, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text("Photo unavailable", x + imgW / 2, rowY + imgH / 2, { align: "center" });
      }
    });

    // Advance y past the last row
    const totalPhotos = Math.min(input.beforePhotos.length, 6);
    const rows = Math.ceil(totalPhotos / cols);
    y += rows * (imgH + 4);
  }

  addFooter();
  return doc;
}

export function downloadEstimatePdf(input: PdfEstimateInput): void {
  const doc = generateEstimatePdf(input);
  doc.save(`${input.estimateNumber}.pdf`);
}

export function estimatePdfBase64(input: PdfEstimateInput): string {
  const doc = generateEstimatePdf(input);
  const dataUrl = doc.output("dataurlstring") as string;
  return dataUrl.includes(",") ? (dataUrl.split(",")[1] ?? "") : "";
}
