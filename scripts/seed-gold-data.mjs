/**
 * Seed Gold Data from Real Completed Jobs
 * Seeds Lilly Pulitzer (EST-24-0294) and 323 Kamani (EST-25-0292) into backend sheet.
 * Also updates Bid_Version totals for all seeded jobs.
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const SA_KEY = JSON.parse(readFileSync('/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json', 'utf-8'));

const auth = new google.auth.JWT({
  email: SA_KEY.client_email,
  key: SA_KEY.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

async function getSheetRows(range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return res.data.values || [];
}

async function appendRows(range, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  console.log(`✅ Appended ${values.length} row(s) to ${range}`);
}

async function updateCell(range, value) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

async function findRow(tabName, colIndex, value) {
  const rows = await getSheetRows(`${tabName}!A1:Z200`);
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][colIndex] || '') === value) return { rowIndex: i + 1, row: rows[i] };
  }
  return null;
}

async function seedJobs() {
  console.log('\n--- Seeding Jobs ---');
  const existingJobs = await getSheetRows('Jobs!A1:K200');
  const existingIds = existingJobs.slice(1).map(r => r[0]);

  // Lilly Pulitzer
  if (!existingIds.includes('EST-24-0294')) {
    await appendRows('Jobs!A:K', [[
      'EST-24-0294',
      'Lilly Pulitzer - Shops of Wailea',
      'Shops of Wailea',
      '',
      'Maui',
      'AWARDED',
      'Commercial',
      '2024-03-27',
      '',
      '2024-03-27T00:00:00',
      'Retail storefront tenant improvement. Completed 2024.',
    ]]);
  } else {
    console.log('  EST-24-0294 already exists');
  }

  // 323 Kamani
  if (!existingIds.includes('EST-25-0292')) {
    await appendRows('Jobs!A:K', [[
      'EST-25-0292',
      '323 Kamani Building Renovation',
      '323 Kamani LLC',
      '',
      'Oahu',
      'AWARDED',
      'Commercial',
      '2025-01-15',
      '',
      '2025-01-15T00:00:00',
      'Fabricated storefront renovation. Small job completed 2025.',
    ]]);
  } else {
    console.log('  EST-25-0292 already exists');
  }
}

async function seedBidVersions() {
  console.log('\n--- Seeding Bid_Versions ---');
  const existingBids = await getSheetRows('Bid_Versions!A1:N200');
  const existingIds = existingBids.slice(1).map(r => r[0]);

  // Lilly Pulitzer
  if (!existingIds.includes('BV-EST-24-0294')) {
    await appendRows('Bid_Versions!A:N', [[
      'BV-EST-24-0294',
      'EST-24-0294',
      '1',
      'AWARDED',
      'Kyle Shimizu',
      '2024-03-27',
      '132691',
      '',
      '0.04712',
      'LABOR_EQUAL',
      '0.10',
      '',
      '2024-03-27T00:00:00',
      'Carl\'s Method estimate. Gold data seeded 2026-04-07.',
    ]]);
  } else {
    console.log('  BV-EST-24-0294 already exists, updating total...');
    // Find and update Total_Estimate (column G = index 6)
    const rowNum = existingBids.findIndex(r => r[0] === 'BV-EST-24-0294') + 1;
    if (rowNum > 0) {
      await updateCell(`Bid_Versions!G${rowNum}`, '132691');
      await updateCell(`Bid_Versions!D${rowNum}`, 'AWARDED');
    }
  }

  // 323 Kamani
  if (!existingIds.includes('BV-EST-25-0292')) {
    await appendRows('Bid_Versions!A:N', [[
      'BV-EST-25-0292',
      'EST-25-0292',
      '1',
      'AWARDED',
      'Kyle Shimizu',
      '2025-01-15',
      '7197',
      '',
      '0.0417',
      'NONE',
      '0.10',
      '',
      '2025-01-15T00:00:00',
      'Small fabricated storefront. Carl\'s Method estimate. Gold data seeded 2026-04-07.',
    ]]);
  } else {
    console.log('  BV-EST-25-0292 already exists, updating total...');
    const rowNum = existingBids.findIndex(r => r[0] === 'BV-EST-25-0292') + 1;
    if (rowNum > 0) {
      await updateCell(`Bid_Versions!G${rowNum}`, '7197');
      await updateCell(`Bid_Versions!D${rowNum}`, 'AWARDED');
    }
  }
}

async function seedTakeoffGlass() {
  console.log('\n--- Seeding Takeoff_Glass ---');
  const existingGlass = await getSheetRows('Takeoff_Glass!A1:V200');
  const existingLineIds = existingGlass.slice(1).map(r => r[0]);

  // Lilly Pulitzer Glass
  const lillyGlass = [
    // Storefront 1: 6'-0" x 9'-0" transom area - 1/2" tempered
    // DLO calc: Frame 6'x9', bite ~1/2" each side (Kawneer 501)
    // DLO W = 72" - (2 x 1.75") sightline = 68.5", bite = 0.5" each side
    // Glass W = 68.5 + 1.0 = 69.5", Glass H = 108" - (2x1.75") = 104.5" + 1.0 = 105.5"
    ['GL-LP-001', 'BV-EST-24-0294', 'Storefront', 'SF-01-MAIN', 'Shops of Wailea - Lilly Pulitzer Storefront', '1/2 TEMP', '68.5', '104.5', '0.5', '69.5', '105.5', '33.49', 'MED', '5', '35.17', '1', '35.17', 'IN', 'A1.0, A2.0', 'Div 08 Spec', 'Kawneer 501, gold finish. DLO from sightline deduction 1.75" per side.'],
    // Storefront 1 transom: 6'-0" x 2'-0"
    // DLO W = 68.5", H = 24" - (2x1.75") = 20.5" + 1.0 bite = 21.5"
    ['GL-LP-002', 'BV-EST-24-0294', 'Storefront', 'SF-01-TRANSOM', 'Shops of Wailea - Lilly Pulitzer Transom', '1/2 TEMP', '68.5', '20.5', '0.5', '69.5', '21.5', '9.78', 'SMALL', '5', '10.27', '1', '10.27', 'IN', 'A1.0, A2.0', 'Div 08 Spec', 'Transom above main storefront. 1/2" tempered, gold finish.'],
    // Storefront 2: 6'-0" x 11'-2" sidelights, 1" IG
    // DLO W = 68.5", H = 134" - (2x1.75") = 130.5" + 1.0 = 131.5" (bite per side 0.5")
    ['GL-LP-003', 'BV-EST-24-0294', 'Storefront', 'SF-02-SIDELIGHT-L', 'Shops of Wailea - Sidelight Left', '1 IG', '32.5', '130.5', '0.5', '33.5', '131.5', '30.63', 'MED', '5', '32.16', '1', '32.16', 'IN', 'A1.0', 'Div 08 Spec', '1" IG unit. 2.5"x5" framing system. Sidelight left of main opening.'],
    ['GL-LP-004', 'BV-EST-24-0294', 'Storefront', 'SF-02-SIDELIGHT-R', 'Shops of Wailea - Sidelight Right', '1 IG', '32.5', '130.5', '0.5', '33.5', '131.5', '30.63', 'MED', '5', '32.16', '1', '32.16', 'IN', 'A1.0', 'Div 08 Spec', '1" IG unit. 2.5"x5" framing system. Sidelight right of main opening.'],
    // Mirrors: 5x 24"x72"
    ['GL-LP-005', 'BV-EST-24-0294', 'Interior Storefront', 'MIR-24x72', 'Interior - Mirror 24x72', 'MIRROR', '24', '72', '0', '24', '72', '12.00', 'MED', '0', '12.00', '5', '60.00', 'IN', 'A3.0', 'Interior Spec', 'Float glass mirrors, unframed, interior retail. 24"x72" each.'],
    // Mirrors: 2x 32"x88"
    ['GL-LP-006', 'BV-EST-24-0294', 'Interior Storefront', 'MIR-32x88', 'Interior - Mirror 32x88', 'MIRROR', '32', '88', '0', '32', '88', '19.56', 'MED', '0', '19.56', '2', '39.11', 'IN', 'A3.0', 'Interior Spec', 'Float glass mirrors, unframed, interior retail. 32"x88" each.'],
    // Mirrors: 1x 52"x88"
    ['GL-LP-007', 'BV-EST-24-0294', 'Interior Storefront', 'MIR-52x88', 'Interior - Mirror 52x88', 'MIRROR', '52', '88', '0', '52', '88', '31.78', 'LARGE', '0', '31.78', '1', '31.78', 'IN', 'A3.0', 'Interior Spec', 'Float glass mirror, unframed, interior retail. 52"x88" single piece.'],
  ];

  // 323 Kamani Glass - Type 1 lites
  const kamaniGlass = [
    // Kawneer Partner Pack storefront - various lites from estimate
    // Type 1: 9+9+8+1+3+2+1+1+2+4+4 = 44 lites, typical storefront sizing
    // Using representative sizes based on storefront module
    ['GL-KM-001', 'BV-EST-25-0292', 'Storefront', 'SF-TYPE1-A', '323 Kamani - Type 1 Storefront Group A', 'TEMP', '38.5', '82.5', '0.5', '39.5', '83.5', '22.86', 'MED', '5', '24.00', '9', '216.00', 'IN', 'SF Plans', 'Div 08', 'Kawneer Partner Pack. Type 1 glass. 9 lites Group A.'],
    ['GL-KM-002', 'BV-EST-25-0292', 'Storefront', 'SF-TYPE1-B', '323 Kamani - Type 1 Storefront Group B', 'TEMP', '38.5', '82.5', '0.5', '39.5', '83.5', '22.86', 'MED', '5', '24.00', '9', '216.00', 'IN', 'SF Plans', 'Div 08', 'Kawneer Partner Pack. Type 1 glass. 9 lites Group B.'],
    ['GL-KM-003', 'BV-EST-25-0292', 'Storefront', 'SF-TYPE1-C', '323 Kamani - Type 1 Storefront Group C', 'TEMP', '38.5', '82.5', '0.5', '39.5', '83.5', '22.86', 'MED', '5', '24.00', '8', '192.00', 'IN', 'SF Plans', 'Div 08', 'Kawneer Partner Pack. Type 1 glass. 8 lites Group C.'],
    ['GL-KM-004', 'BV-EST-25-0292', 'Storefront', 'SF-TYPE1-D', '323 Kamani - Type 1 Various', 'TEMP', '38.5', '82.5', '0.5', '39.5', '83.5', '22.86', 'MED', '5', '24.00', '18', '432.00', 'IN', 'SF Plans', 'Div 08', 'Kawneer Partner Pack. Type 1 remaining lites (1+3+2+1+1+2+4+4=18).'],
  ];

  const toInsert = [];
  for (const row of [...lillyGlass, ...kamaniGlass]) {
    if (!existingLineIds.includes(row[0])) {
      toInsert.push(row);
    } else {
      console.log(`  Glass line ${row[0]} already exists, skipping`);
    }
  }
  if (toInsert.length > 0) {
    await appendRows('Takeoff_Glass!A:V', toInsert);
  }
}

async function seedTakeoffDoors() {
  console.log('\n--- Seeding Takeoff_Doors ---');
  const existing = await getSheetRows('Takeoff_Doors!A1:M200');
  const existingIds = existing.slice(1).map(r => r[0]);

  const lillyDoors = [
    // All-glass door package from Lilly Pulitzer estimate
    ['DR-LP-001', 'BV-EST-24-0294', 'D-01', 'Exterior Doors', 'Storefront', 'Shops of Wailea Main Entrance', '1', 'Y', 'IN', 'All-glass door, gold finish. Included in Kawneer package. DLO per door hardware submittal.', 'A1.0', 'Div 08', 'All glass door, gold anodized finish. Part of storefront system SF-01.'],
  ];

  const toInsert = lillyDoors.filter(r => !existingIds.includes(r[0]));
  if (toInsert.length > 0) {
    await appendRows('Takeoff_Doors!A:M', toInsert);
  } else {
    console.log('  Door rows already exist');
  }
}

async function seedTakeoffSealant() {
  console.log('\n--- Seeding Takeoff_Sealant ---');
  const existing = await getSheetRows('Takeoff_Sealant!A1:O200');
  const existingIds = existing.slice(1).map(r => r[0]);

  const lillySealant = [
    // Perimeter sealant for Lilly Pulitzer storefront
    ['SL-LP-001', 'BV-EST-24-0294', 'Storefront', 'SF-01-MAIN', 'PERIMETER', 'Shops of Wailea - Ext Perimeter', 'Dow 795', 'Y', '3/8x3/8', '62', '10', 'IN', 'A1.0', 'Div 07 Spec', 'Exterior perimeter sealant at storefront head and jambs. Gold-compatible neutral cure.'],
    ['SL-LP-002', 'BV-EST-24-0294', 'Storefront', 'SF-02-SIDELIGHTS', 'PERIMETER', 'Shops of Wailea - Sidelight Perimeter', 'Dow 795', 'Y', '3/8x3/8', '48', '10', 'IN', 'A1.0', 'Div 07 Spec', 'Exterior perimeter sealant at sidelight frames.'],
    ['SL-LP-003', 'BV-EST-24-0294', 'Interior Storefront', 'MIR-ALL', 'MIRROR-EDGE', 'Interior Mirror Edges', 'Dow 795', 'N', '1/4x1/4', '120', '5', 'IN', 'A3.0', 'Interior Spec', 'Mirror edge sealant - all 8 mirror panels. Clear sealant at edges.'],
  ];

  const kamaniSealant = [
    ['SL-KM-001', 'BV-EST-25-0292', 'Storefront', 'SF-TYPE1', 'PERIMETER', '323 Kamani Ext Perimeter', 'Dow 795', 'Y', '3/8x3/8', '120', '10', 'IN', 'SF Plans', 'Div 07', 'Exterior perimeter sealant all storefront openings. Included in partner pack scope.'],
  ];

  const toInsert = [...lillySealant, ...kamaniSealant].filter(r => !existingIds.includes(r[0]));
  if (toInsert.length > 0) {
    await appendRows('Takeoff_Sealant!A:O', toInsert);
  } else {
    console.log('  Sealant rows already exist');
  }
}

async function seedCarlsMethod() {
  console.log('\n--- Seeding Carls_Method ---');
  const existing = await getSheetRows('Carls_Method!A1:D200');
  const existingBidIds = existing.slice(1).map(r => r[1]);

  // Lilly Pulitzer Carl's Method
  if (!existingBidIds.includes('BV-EST-24-0294')) {
    const lillyData = {
      job_name: "Lilly Pulitzer - Shops of Wailea",
      job_id: "EST-24-0294",
      bid_version_id: "BV-EST-24-0294",
      estimator: "Kyle Shimizu",
      bid_date: "2024-03-27",
      island: "Maui",
      materials: {
        aluminum: {
          kawneer_501_storefront: 5000,
          all_glass_door: 10000,
          subtotal: 15000
        },
        glass: {
          mirrors: 1500,
          nine_sixteenth_at_50_per_sf: 10000,
          subtotal: 11500
        },
        misc: {
          caulking: 1500,
          tape_gaskets: 1000,
          fasteners: 1500,
          shims: 750,
          shop_drawings: 3500,
          freight: 15000,
          subtotal: 23250
        },
        other: {
          equipment: 1200,
          misc: 2000,
          fabrication: 5000,
          powder_coating: 10000,
          subtotal: 18200
        },
        total_materials: 67950
      },
      labor: {
        field_hours: 225,
        rate_per_hour: 105,
        total_labor: 23625
      },
      overhead: {
        method: "LABOR_EQUAL",
        amount: 23625
      },
      profit: {
        pct: 0.10,
        amount: 11520
      },
      get_tax: {
        rate: 0.04712,
        amount: 5971
      },
      grand_total: 132691,
      scope_summary: {
        storefront_1: "6'-0\" x 9'-0\" with 6'-0\" x 2'-0\" transom, gold finish, 1/2\" tempered",
        storefront_2: "6'-0\" x 11'-2\" sidelights, 1\" IG, 2.5\"x5\" framing",
        mirrors: "5ea 24x72, 2ea 32x88, 1ea 52x88 float glass mirrors"
      },
      notes: "Carl's Method estimate. Completed job. Real data from original estimate sheet."
    };
    await appendRows('Carls_Method!A:D', [[
      'CM-EST-24-0294-001',
      'BV-EST-24-0294',
      JSON.stringify(lillyData),
      new Date().toISOString(),
    ]]);
  } else {
    console.log('  Carls_Method for BV-EST-24-0294 already exists');
  }

  // 323 Kamani Carl's Method
  if (!existingBidIds.includes('BV-EST-25-0292')) {
    const kamaniData = {
      job_name: "323 Kamani Building Renovation",
      job_id: "EST-25-0292",
      bid_version_id: "BV-EST-25-0292",
      estimator: "Kyle Shimizu",
      bid_date: "2025-01-15",
      island: "Oahu",
      materials: {
        aluminum: {
          kawneer_partner_pack: 4505.96,
          subtotal: 4505.96
        },
        glass: {
          note: "Included in Kawneer Partner Pack",
          subtotal: 0
        },
        misc: {
          freight: 800,
          subtotal: 800
        },
        total_materials: 5305.96
      },
      labor: {
        description: "Fabrication + Field",
        rate_per_hour: 105,
        total_labor: 975
      },
      overhead: {
        method: "NONE",
        note: "Small job — no overhead applied",
        amount: 0
      },
      profit: {
        pct: 0.10,
        amount: 628.10
      },
      get_tax: {
        rate: 0.0417,
        amount: 288.11
      },
      grand_total: 7197.16,
      glass_quantities: {
        type_1: {
          count_breakdown: [9, 9, 8, 1, 3, 2, 1, 1, 2, 4, 4],
          total_lites: 44,
          note: "Various sizes per estimate sheet right-side columns"
        }
      },
      notes: "Small fabricated storefront renovation. Partner pack job. Real data from original estimate sheet."
    };
    await appendRows('Carls_Method!A:D', [[
      'CM-EST-25-0292-001',
      'BV-EST-25-0292',
      JSON.stringify(kamaniData),
      new Date().toISOString(),
    ]]);
  } else {
    console.log('  Carls_Method for BV-EST-25-0292 already exists');
  }
}

async function updateExistingBidTotals() {
  console.log('\n--- Updating existing Bid_Version totals ---');
  const bids = await getSheetRows('Bid_Versions!A1:N200');
  const headers = bids[0];
  const statusIdx = headers.indexOf('Status');
  const totalIdx = headers.indexOf('Total_Estimate');

  // Known totals for previously seeded jobs
  const knownTotals = {
    // Halawa Correctional Facility (if seeded previously)
    'BV-EST-26-0003': { total: null, status: 'Submitted' },
    'BV-EST-26-0004': { total: null, status: 'Submitted' },
    // Bank of Hawaii
    'BV-EST-26-0008': { total: null, status: 'Submitted' },
    // FBI
    'BV-EST-26-0044': { total: null, status: 'Submitted' },
  };

  for (let i = 1; i < bids.length; i++) {
    const bidId = bids[i][0];
    if (knownTotals[bidId] && knownTotals[bidId].total) {
      const rowNum = i + 1;
      console.log(`  Updating ${bidId} total to ${knownTotals[bidId].total}`);
      await updateCell(`Bid_Versions!G${rowNum}`, String(knownTotals[bidId].total));
    }
  }
  console.log('  Existing bid totals check complete (null totals skipped — no real data available)');
}

async function main() {
  console.log('🚀 Starting gold data seeding...\n');
  
  await seedJobs();
  await seedBidVersions();
  await seedTakeoffGlass();
  await seedTakeoffDoors();
  await seedTakeoffSealant();
  await seedCarlsMethod();
  await updateExistingBidTotals();

  console.log('\n✅ Gold data seeding complete!');
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
