/**
 * Phase 0: Estimating Schema Setup
 * 
 * Creates new sheet tabs and extends existing tabs in the backend sheet.
 * Run once: node scripts/setup_estimating_schema.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const SERVICE_ACCOUNT_PATH = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';

// ── New tabs to create ────────────────────────────────────────────────────────

const NEW_TABS = [
  {
    name: 'Takeoff_Doors',
    headers: [
      'Door_Line_ID', 'Bid_Version_ID', 'Door_Tag', 'Door_Type',
      'System_Type_Context', 'Location', 'Qty_EA', 'Glazed_Lite_YN',
      'Qty_Status', 'Assumptions', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
  },
  {
    name: 'Takeoff_Glass',
    headers: [
      'Glass_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Location', 'Glass_Type_Code', 'DLO_Width_in', 'DLO_Height_in',
      'Bite_Per_Side_in', 'Glass_Width_in', 'Glass_Height_in', 'DLO_SF',
      'Lite_Area_Tier', 'Allowance_Pct', 'Buy_SF', 'Qty_EA', 'Total_Buy_SF',
      'Qty_Status', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
  },
  {
    name: 'Takeoff_Sealant',
    headers: [
      'Seal_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Joint_Bucket', 'Location', 'Sealant_Type', 'Backer_Rod_YN',
      'Joint_Size_WxD', 'Qty_LF', 'Waste_Pct', 'Qty_Status',
      'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
  },
  {
    name: 'Takeoff_Fasteners',
    headers: [
      'Fast_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Application', 'Fastener_Type', 'Size', 'Material_Grade',
      'Substrate', 'Spacing_or_Basis', 'Qty_EA', 'Waste_Pct',
      'Qty_Status', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
  },
  {
    name: 'Takeoff_Flashing',
    headers: [
      'Flash_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Item_Description', 'Profile_Dims', 'Developed_Width', 'Material',
      'Thickness', 'Finish', 'Qty_LF', 'Qty_EA', 'Waste_Pct',
      'Qty_Status', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
  },
  {
    name: 'Method_Comparison',
    headers: [
      'Comparison_ID', 'Bid_Version_ID', 'Method', 'Category',
      'Value', 'Unit', 'Source_Link', 'Notes',
    ],
  },
  {
    name: 'System_Compliance',
    headers: [
      'Compliance_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Spec_Requirement', 'Required_Value', 'Tested_Value', 'Test_Report_Ref',
      'TAS_Number', 'Miami_Dade_NOA', 'Manufacturer', 'Product_Series',
      'Tested_Max_Width_in', 'Tested_Max_Height_in', 'Tested_Wind_Load_PSF',
      'Required_Wind_Load_PSF', 'DLO_Width_in', 'DLO_Height_in',
      'Compliance_Status', 'Risk_Level', 'Notes',
    ],
  },
  {
    name: 'Manufacturer_Products',
    headers: [
      'Product_ID', 'Manufacturer', 'Product_Series', 'System_Type',
      'Performance_Class', 'Tested_Wind_Load_PSF', 'Tested_Water_PSF',
      'Tested_Air_CFM', 'Thermal_U_Value', 'Max_Tested_Width_in',
      'Max_Tested_Height_in', 'AAMA_Rating', 'TAS_Numbers', 'Miami_Dade_NOA',
      'Has_Lab_Mockup', 'Data_Source_URL', 'Last_Updated', 'Notes',
    ],
  },
  {
    name: 'Spec_Requirements',
    headers: [
      'Req_ID', 'Bid_Version_ID', 'Spec_Section', 'Requirement_Type',
      'ASTM_Standard', 'Required_Value', 'Unit', 'Testing_Required',
      'Estimated_Testing_Cost', 'Notes',
    ],
  },
  {
    name: 'Cost_Benchmarks',
    headers: [
      'Benchmark_ID', 'System_Type', 'Assembly_ID', 'Island',
      'Metric_Type', 'Historical_Value', 'Industry_Value', 'Actual_Value',
      'Sample_Size', 'Last_Updated', 'Notes',
    ],
  },
];

// ── Existing tabs to extend ───────────────────────────────────────────────────

const EXTEND_TABS = [
  {
    name: 'Assembly_Summary',
    addHeaders: ['Access_Type', 'Complexity_Level', 'Special_Conditions', 'Install_Basis_Note'],
  },
  {
    name: 'Estimate_Lines',
    addHeaders: ['Historical_Unit_Cost', 'Industry_Unit_Cost', 'Actual_Unit_Cost'],
  },
  {
    name: 'Labor_Lines',
    addHeaders: [
      'Labor_Step', 'Base_Hours', 'Productivity_Basis', 'Friction_Pct',
      'Friction_Source', 'Crew_Size_Assumption', 'Adjusted_Hours', 'Step_Source_Ref',
    ],
  },
];

// ── Also create Jobs and Bid_Versions if they don't exist ────────────────────

const CORE_TABS = [
  {
    name: 'Jobs',
    headers: [
      'Job_ID', 'Project_Name', 'Client_GC_Name', 'Architect', 'Island',
      'Job_Status', 'Job_Type', 'Bid_Due_Date', 'Project_Folder_URL',
      'Created_At', 'Notes',
    ],
  },
  {
    name: 'Bid_Versions',
    headers: [
      'Bid_Version_ID', 'Job_ID', 'Version_Number', 'Status', 'Estimator',
      'Bid_Date', 'Total_Estimate', 'Markup_Pct', 'GET_Rate',
      'Overhead_Method', 'Profit_Pct', 'Proposal_DOC_URL', 'Created_At', 'Notes',
    ],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔑 Loading service account credentials...');
  const keyFile = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  const auth = new google.auth.JWT({
    email: keyFile.client_email,
    key: keyFile.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Get current spreadsheet metadata
  console.log('📊 Fetching spreadsheet metadata...');
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = new Set(meta.data.sheets?.map(s => s.properties?.title) || []);
  console.log(`   Found ${existingTabs.size} existing tabs`);

  // ── Step 1: Create new tabs ──────────────────────────────────────────────

  const allNewTabs = [...CORE_TABS, ...NEW_TABS];
  const tabsToCreate = allNewTabs.filter(t => !existingTabs.has(t.name));

  if (tabsToCreate.length > 0) {
    console.log(`\n➕ Creating ${tabsToCreate.length} new tabs...`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: tabsToCreate.map(t => ({
          addSheet: { properties: { title: t.name } },
        })),
      },
    });

    // Write headers to each new tab
    for (const tab of tabsToCreate) {
      console.log(`   Writing headers to ${tab.name}...`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${tab.name}!A1:${colLetter(tab.headers.length - 1)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [tab.headers] },
      });
    }
  } else {
    console.log('\n✅ All new tabs already exist — skipping creation');
  }

  // ── Step 2: Extend existing tabs ─────────────────────────────────────────

  console.log(`\n📝 Extending ${EXTEND_TABS.length} existing tabs with new columns...`);

  for (const ext of EXTEND_TABS) {
    if (!existingTabs.has(ext.name)) {
      console.log(`   ⚠️  Tab "${ext.name}" not found — skipping`);
      continue;
    }

    // Read existing headers from row 1
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${ext.name}!1:1`,
    });
    const existingHeaders = (res.data.values?.[0] || []);
    const existingSet = new Set(existingHeaders);

    const newHeaders = ext.addHeaders.filter(h => !existingSet.has(h));
    if (newHeaders.length === 0) {
      console.log(`   ✅ ${ext.name} — all columns already present`);
      continue;
    }

    // Append new headers after the last existing column
    const startCol = existingHeaders.length;
    const endCol = startCol + newHeaders.length - 1;

    console.log(`   Adding ${newHeaders.length} columns to ${ext.name}: ${newHeaders.join(', ')}`);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${ext.name}!${colLetter(startCol)}1:${colLetter(endCol)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newHeaders] },
    });
  }

  console.log('\n✅ Schema setup complete!');
  console.log('\nSummary:');
  console.log(`  - Created ${tabsToCreate.length} new tabs`);
  console.log(`  - Extended ${EXTEND_TABS.length} existing tabs`);
}

function colLetter(idx) {
  // Supports A-Z, AA-AZ, etc.
  if (idx < 26) return String.fromCharCode(65 + idx);
  const first = Math.floor(idx / 26) - 1;
  const second = idx % 26;
  return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
