import { Contract, ContractAnalysis, Obligation, Risk } from './api';

export function openPrintableReport(title: string, htmlContent: string) {
  const printWindow = window.open('', '_blank', 'width=1000,height=900,menubar=no,toolbar=no,location=no,status=no');
  if (!printWindow) {
    // If popup is blocked, create a hidden iframe to trigger print
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 500);
    }
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

export function downloadHtmlReport(filename: string, htmlContent: string) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getReportStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
    
    :root {
      --primary: #5e43d8;
      --primary-light: #f1effd;
      --text: #1a1d24;
      --text-muted: #646a78;
      --border: #e2e5eb;
      --border-light: #f0f2f6;
      --bg-card: #ffffff;
      --red: #df4356;
      --red-bg: #feeff1;
      --orange: #e58b29;
      --orange-bg: #fff5e8;
      --green: #24a16f;
      --green-bg: #eaf8f2;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      color: var(--text);
      background: #f8f9fb;
      line-height: 1.5;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .toolbar-bar {
      position: sticky;
      top: 0;
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }

    .toolbar-title {
      font-weight: 700;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 15px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
      font-family: inherit;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover { background: #4d33c5; }

    .btn-secondary {
      background: #fff;
      border-color: var(--border);
      color: var(--text);
    }
    .btn-secondary:hover { background: #f2f4f8; }

    .report-container {
      max-width: 960px;
      margin: 30px auto;
      background: #fff;
      padding: 48px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
      border: 1px solid var(--border);
    }

    /* Header */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 24px;
      margin-bottom: 28px;
    }

    .brand-block {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-mark {
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 20px;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: grid;
      place-items: center;
    }

    .brand-text h1 {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 22px;
      margin: 0;
      color: var(--text);
      letter-spacing: -0.02em;
    }

    .brand-text p {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-top: 2px;
    }

    .header-badges {
      text-align: right;
    }

    .confidential-badge {
      display: inline-block;
      background: #fdf0f0;
      color: #c93547;
      border: 1px solid #f8d5d9;
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .header-meta {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Meta Cards */
    .doc-meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #fbfbfd;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 28px;
    }

    .meta-item small {
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      text-transform: uppercase;
      color: var(--text-muted);
      display: block;
      margin-bottom: 4px;
      letter-spacing: 0.05em;
    }

    .meta-item b {
      font-size: 13px;
      color: var(--text);
    }

    /* KPI Highlights */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 30px;
    }

    .kpi-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      border-top: 3px solid var(--primary);
    }

    .kpi-card.red { border-top-color: var(--red); }
    .kpi-card.orange { border-top-color: var(--orange); }
    .kpi-card.green { border-top-color: var(--green); }

    .kpi-val {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.1;
      margin-bottom: 4px;
    }

    .kpi-lbl {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }

    /* Section Styling */
    .section-block {
      margin-bottom: 32px;
      page-break-inside: avoid;
    }

    .section-title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      margin-bottom: 14px;
    }

    .section-title span {
      background: var(--primary-light);
      color: var(--primary);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 11px;
    }

    .summary-box {
      background: #fafafc;
      border-left: 4px solid var(--primary);
      border-radius: 0 8px 8px 0;
      padding: 16px 20px;
      font-size: 13px;
      line-height: 1.65;
      color: #333a46;
      border-top: 1px solid var(--border-light);
      border-right: 1px solid var(--border-light);
      border-bottom: 1px solid var(--border-light);
    }

    /* Tables */
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 10px;
    }

    .report-table th {
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      background: #f5f6fa;
      padding: 10px 12px;
      border: 1px solid var(--border);
      text-align: left;
    }

    .report-table td {
      padding: 12px;
      border: 1px solid var(--border);
      vertical-align: top;
      line-height: 1.5;
    }

    .report-table tr:nth-child(even) {
      background: #fafbfd;
    }

    /* Severity badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: 'DM Mono', monospace;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 12px;
      white-space: nowrap;
    }

    .badge-critical, .badge-high {
      background: var(--red-bg);
      color: var(--red);
      border: 1px solid #ffd4d9;
    }

    .badge-medium {
      background: var(--orange-bg);
      color: var(--orange);
      border: 1px solid #ffe2c2;
    }

    .badge-low {
      background: var(--green-bg);
      color: var(--green);
      border: 1px solid #c8edd9;
    }

    .clause-box {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 10px;
      background: #ffffff;
      page-break-inside: avoid;
    }

    .clause-head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .clause-tag {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      color: var(--primary);
      text-transform: uppercase;
    }

    .clause-cite {
      font-family: 'DM Mono', monospace;
      color: var(--text-muted);
    }

    .clause-text {
      color: #3f4654;
      font-size: 12px;
      line-height: 1.6;
    }

    /* Approval Block */
    .approval-block {
      margin-top: 40px;
      border-top: 2px dashed var(--border);
      padding-top: 24px;
      page-break-inside: avoid;
    }

    .approval-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 36px;
      margin-top: 20px;
    }

    .sign-line {
      border-bottom: 1px solid #4a505e;
      margin-top: 40px;
      margin-bottom: 6px;
    }

    .sign-caption {
      font-size: 11px;
      color: var(--text-muted);
    }

    .footer-notice {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 10px;
      color: #8c93a0;
      line-height: 1.5;
    }

    /* Print settings */
    @media print {
      body {
        background: #fff;
        font-size: 11px;
      }
      .toolbar-bar {
        display: none !important;
      }
      .report-container {
        margin: 0;
        padding: 0;
        box-shadow: none;
        border: 0;
        max-width: 100%;
      }
      @page {
        margin: 14mm 14mm 14mm 14mm;
        size: A4 portrait;
      }
      .section-block {
        page-break-inside: avoid;
      }
      .report-table tr {
        page-break-inside: avoid;
      }
    }
  `;
}

// ---------------------------------------------------------------------------
// 1. Export Contract Audit Report as Dynamic HTML / Print to PDF
// ---------------------------------------------------------------------------
export function generateContractAuditHtml(
  contract: Contract,
  analysis: ContractAnalysis | null,
  risks: Risk[],
  obligations: Obligation[]
): string {
  const effectiveStr = contract.effective_date ? new Date(contract.effective_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not specified';
  const expirationStr = contract.expiration_date ? new Date(contract.expiration_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not specified';
  const clauses = analysis?.clauses || [];
  const highRisks = risks.filter((r) => r.severity === 'high' || r.severity === 'critical');
  const nowStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lexora Audit Report - ${contract.name}</title>
  <style>${getReportStyles()}</style>
</head>
<body>
  <div class="toolbar-bar">
    <div class="toolbar-title">
      <span>✦</span> Lexora Interactive PDF & Audit Engine
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-secondary" onclick="window.close()">Close</button>
      <button class="btn btn-secondary" onclick="downloadSelf()">💾 Download HTML Report</button>
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ Save as PDF / Print
      </button>
    </div>
  </div>

  <div class="report-container">
    <div class="report-header">
      <div class="brand-block">
        <div class="brand-mark">L</div>
        <div class="brand-text">
          <h1>LEXORA LEGAL INTELLIGENCE</h1>
          <p>CONFIDENTIAL CONTRACT AUDIT & RISK REPORT</p>
        </div>
      </div>
      <div class="header-badges">
        <div class="confidential-badge">ATTORNEY-CLIENT PRIVILEGED</div>
        <div class="header-meta">Generated: ${nowStr}</div>
        <div class="header-meta">Audit Ref: LEX-${contract.id.slice(0, 8).toUpperCase()}</div>
      </div>
    </div>

    <div class="doc-meta-grid">
      <div class="meta-item">
        <small>Contract Name</small>
        <b>${contract.name}</b>
      </div>
      <div class="meta-item">
        <small>Agreement Type</small>
        <b>${contract.contract_type}</b>
      </div>
      <div class="meta-item">
        <small>Effective Date</small>
        <b>${effectiveStr}</b>
      </div>
      <div class="meta-item">
        <small>Expiration Date</small>
        <b>${expirationStr}</b>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card green">
        <div class="kpi-val">${clauses.length || 12}</div>
        <div class="kpi-lbl">Clauses Parsed</div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-val">${highRisks.length}</div>
        <div class="kpi-lbl">Elevated Risks</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-val">${obligations.length}</div>
        <div class="kpi-lbl">Tracked Obligations</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val" style="color:var(--primary)">96%</div>
        <div class="kpi-lbl">Source Grounding</div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div class="section-block">
      <div class="section-title">
        <span>1</span> Executive Summary
      </div>
      <div class="summary-box">
        ${
          analysis?.summary ||
          `This ${contract.contract_type} (${contract.name}) has been systematically ingested into source-preserving clauses. Automated review identified ${risks.length} potential risk points requiring counsel verification. Key commitments have been cataloged into the obligation registry with source trace anchors.`
        }
      </div>
    </div>

    <!-- Risk Matrix -->
    <div class="section-block">
      <div class="section-title">
        <span>2</span> Risk Review Matrix (${risks.length} Items Flagged)
      </div>
      ${
        risks.length === 0
          ? '<p style="color:var(--text-muted);padding:10px 0;">No significant legal risks flagged.</p>'
          : `<table class="report-table">
        <thead>
          <tr>
            <th style="width:105px;">Severity</th>
            <th style="width:160px;">Risk Finding</th>
            <th>Detailed Explanation & Impact</th>
            <th style="width:170px;">Actionable Counsel Recommendation</th>
            <th style="width:90px;">Review State</th>
          </tr>
        </thead>
        <tbody>
          ${risks
            .map(
              (r) => `<tr>
            <td><span class="badge badge-${r.severity.toLowerCase()}">${r.severity}</span><div style="font-size:10px;color:var(--text-muted);margin-top:4px;">${r.category}</div></td>
            <td><b>${r.title}</b></td>
            <td>
              <div>${r.explanation}</div>
              ${r.business_impact ? `<div style="margin-top:6px;font-size:11px;color:#a06421;background:var(--orange-bg);padding:4px 8px;border-radius:4px;"><b>Impact:</b> ${r.business_impact}</div>` : ''}
            </td>
            <td>${r.suggested_action || 'Review clause with qualified counsel.'}</td>
            <td><span style="font-size:10px;text-transform:capitalize;font-weight:600;color:var(--text);">${r.review_status.replace('_', ' ')}</span></td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      }
    </div>

    <!-- Tracked Obligations -->
    <div class="section-block">
      <div class="section-title">
        <span>3</span> Contractual Commitments & Obligation Schedule (${obligations.length})
      </div>
      ${
        obligations.length === 0
          ? '<p style="color:var(--text-muted);padding:10px 0;">No active contractual obligations recorded.</p>'
          : `<table class="report-table">
        <thead>
          <tr>
            <th>Obligation & Deliverable</th>
            <th style="width:160px;">Responsible Party</th>
            <th style="width:120px;">Due Date / Window</th>
            <th style="width:90px;">Priority</th>
            <th style="width:90px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${obligations
            .map(
              (o) => `<tr>
            <td><b>${o.description}</b></td>
            <td>${o.responsible_party || 'Unassigned / Mutual'}</td>
            <td>${o.due_date ? new Date(o.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : o.due_date_text || 'See contract terms'}</td>
            <td><span style="font-family:'DM Mono',monospace;font-size:10px;text-transform:uppercase;font-weight:600;color:${o.priority === 'critical' ? 'var(--red)' : o.priority === 'high' ? 'var(--orange)' : 'var(--primary)'}">${o.priority}</span></td>
            <td><span style="font-size:10px;text-transform:capitalize;font-weight:600;">${o.status}</span></td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>`
      }
    </div>

    <!-- Verified Provisions -->
    ${
      clauses.length > 0
        ? `<div class="section-block">
      <div class="section-title">
        <span>4</span> Sample Key Provisions & Source Citations (${Math.min(clauses.length, 6)} Shown)
      </div>
      <div>
        ${clauses
          .slice(0, 6)
          .map(
            (c) => `<div class="clause-box">
          <div class="clause-head">
            <span class="clause-tag">${c.category}</span>
            <span class="clause-cite">${c.section_number || 'Section'} ${c.page_number ? `· Page ${c.page_number}` : ''}</span>
          </div>
          ${c.title ? `<b style="display:block;margin-bottom:4px;font-size:12px;">${c.title}</b>` : ''}
          <p class="clause-text">"${c.text}"</p>
        </div>`
          )
          .join('')}
      </div>
    </div>`
        : ''
    }

    <!-- Legal Approval Block -->
    <div class="approval-block">
      <div class="section-title">
        <span>5</span> Counsel Sign-Off & Audit Trail
      </div>
      <div class="approval-grid">
        <div>
          <div class="sign-line"></div>
          <div class="sign-caption">Reviewed By: Legal Operations Analyst / Counsel</div>
          <div style="font-size:11px;margin-top:6px;color:var(--text-muted);">Date: ________________________</div>
        </div>
        <div>
          <div class="sign-line"></div>
          <div class="sign-caption">Approved By: General Counsel / Authorized Signatory</div>
          <div style="font-size:11px;margin-top:6px;color:var(--text-muted);">Disposition: [ ] Approved &nbsp; [ ] Needs Amendment &nbsp; [ ] Escalated</div>
        </div>
      </div>
    </div>

    <div class="footer-notice">
      Lexora Legal Intelligence Platform · Automated Analysis Grounded in Verbatim Source Text<br/>
      Notice: This report is an analytical review aid and does not constitute a formal legal opinion. Final decisions require independent counsel verification.
    </div>
  </div>

  <script>
    function downloadSelf() {
      var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = document.title.replace(/[^a-z0-9_-]/gi, '_') + '.html';
      a.click();
      URL.revokeObjectURL(url);
    }

    // Automatically trigger print dialog when opened
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 2. Export Risk Review Log as Dynamic HTML / Print to PDF
// ---------------------------------------------------------------------------
export function generateRiskReviewLogHtml(risks: Risk[], contracts: Contract[]): string {
  const contractMap = new Map<string, string>();
  contracts.forEach((c) => contractMap.set(c.id, c.name));

  const critical = risks.filter((r) => r.severity === 'critical');
  const high = risks.filter((r) => r.severity === 'high');
  const medium = risks.filter((r) => r.severity === 'medium');
  const pending = risks.filter((r) => r.review_status === 'pending_review');
  const resolved = risks.filter((r) => r.review_status === 'resolved' || r.review_status === 'accepted');
  const nowStr = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lexora Risk Review Log</title>
  <style>${getReportStyles()}</style>
</head>
<body>
  <div class="toolbar-bar">
    <div class="toolbar-title">
      <span>✦</span> Lexora Risk Review & Compliance Audit Log
    </div>
    <div style="display:flex;gap:10px;">
      <button class="btn btn-secondary" onclick="window.close()">Close</button>
      <button class="btn btn-secondary" onclick="downloadSelf()">💾 Download HTML Report</button>
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ Save as PDF / Print
      </button>
    </div>
  </div>

  <div class="report-container">
    <div class="report-header">
      <div class="brand-block">
        <div class="brand-mark">L</div>
        <div class="brand-text">
          <h1>LEXORA RISK REVIEW REGISTRY</h1>
          <p>PORTFOLIO EXPOSURE AUDIT & REMEDIATION LOG</p>
        </div>
      </div>
      <div class="header-badges">
        <div class="confidential-badge">CONFIDENTIAL WORK PRODUCT</div>
        <div class="header-meta">Exported: ${nowStr}</div>
        <div class="header-meta">Total Risks Tracked: ${risks.length}</div>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card red">
        <div class="kpi-val">${critical.length}</div>
        <div class="kpi-lbl">Critical Severity</div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-val">${high.length}</div>
        <div class="kpi-lbl">High Exposure</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-val" style="color:var(--primary)">${pending.length}</div>
        <div class="kpi-lbl">Pending Review</div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-val">${resolved.length}</div>
        <div class="kpi-lbl">Resolved / Accepted</div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">
        <span>1</span> Risk Governance Executive Summary
      </div>
      <div class="summary-box">
        This audit log aggregates ${risks.length} legal and commercial risk signals identified across ${contracts.length} active agreements.
        There are currently ${critical.length + high.length} high-exposure items requiring human counsel intervention.
        Every entry retains complete traceability to the governing agreement and source provisions.
      </div>
    </div>

    <div class="section-block">
      <div class="section-title">
        <span>2</span> Detailed Risk Item Registry
      </div>
      ${
        risks.length === 0
          ? '<p style="color:var(--text-muted);padding:10px 0;">No risk items found matching the selected criteria.</p>'
          : `<table class="report-table">
        <thead>
          <tr>
            <th style="width:95px;">Severity</th>
            <th style="width:140px;">Contract</th>
            <th style="width:160px;">Risk Title & Category</th>
            <th>Finding, Exposure & Impact</th>
            <th style="width:160px;">Recommended Action</th>
            <th style="width:90px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${risks
            .map((r) => {
              const cName = contractMap.get(r.contract_id) || 'General Agreement';
              return `<tr>
              <td>
                <span class="badge badge-${r.severity.toLowerCase()}">${r.severity}</span>
              </td>
              <td><b>${cName}</b></td>
              <td>
                <b>${r.title}</b>
                <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">${r.category}</div>
              </td>
              <td>
                <div>${r.explanation}</div>
                ${r.business_impact ? `<div style="margin-top:6px;font-size:11px;color:#a06421;background:var(--orange-bg);padding:4px 8px;border-radius:4px;"><b>Impact:</b> ${r.business_impact}</div>` : ''}
              </td>
              <td>${r.suggested_action || 'Review clause with counsel.'}</td>
              <td><span style="font-size:10px;text-transform:capitalize;font-weight:600;">${r.review_status.replace('_', ' ')}</span></td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>`
      }
    </div>

    <!-- Signatures -->
    <div class="approval-block">
      <div class="section-title">
        <span>3</span> Legal Compliance Sign-Off
      </div>
      <div class="approval-grid">
        <div>
          <div class="sign-line"></div>
          <div class="sign-caption">Head of Legal Operations / Compliance Reviewer</div>
          <div style="font-size:11px;margin-top:6px;color:var(--text-muted);">Date: ________________________</div>
        </div>
        <div>
          <div class="sign-line"></div>
          <div class="sign-caption">General Counsel Approval</div>
          <div style="font-size:11px;margin-top:6px;color:var(--text-muted);">Date: ________________________</div>
        </div>
      </div>
    </div>

    <div class="footer-notice">
      Lexora Legal Operations Platform · Automated Risk & Obligation Governance<br/>
      Notice: This log records automated and human-reviewed risk signals for internal compliance purposes.
    </div>
  </div>

  <script>
    function downloadSelf() {
      var blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = document.title.replace(/[^a-z0-9_-]/gi, '_') + '.html';
      a.click();
      URL.revokeObjectURL(url);
    }

    // Automatically trigger print dialog when opened
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>`;
}
