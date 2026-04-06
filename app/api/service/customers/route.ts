import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';

const SHEETS = {
  active:    '7905619916154756',
  completed: '8935301818148740',
  quoted:    '1349614456229764',
};

export type CustomerRecord = {
  name: string;
  contact: string;         // raw CONTACT # value
  contactPerson: string;   // parsed contact name
  contactPhone: string;    // parsed contact phone
  address: string;
  island: string;
  woCount: number;
};

// Simple in-process cache (10 minutes)
let customersCache: { data: CustomerRecord[]; ts: number } | null = null;

function toTitleCase(str: string): string {
  if (!str) return str;
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

async function fetchCustomersFromSheet(token: string, sheetId: string) {
  const res = await fetch(
    `https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as {
    columns?: { id: number; title: string }[];
    rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
  };

  const cols: Record<number, string> = {};
  for (const c of data.columns || []) cols[c.id] = c.title;

  return (data.rows || []).map(row => {
    const rd: Record<string, string> = {};
    for (const cell of row.cells || []) {
      if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value || '');
    }
    const name = (rd['Task Name / Job Name'] || rd['Job Name/WO Number'] || '').split('\n')[0].substring(0, 80).trim();
    const contact = (rd['CONTACT #'] || '').split('\n')[0].substring(0, 60).trim();
    const address = (rd['ADDRESS'] || '').substring(0, 80).trim();
    const island = rd['Area of island'] || '';

    // Parse contact into person name and phone number
    let contactPerson = '';
    let contactPhone = '';
    if (contact) {
      const parts = contact.split(' · ');
      if (parts.length >= 2) {
        contactPerson = parts[0].trim();
        contactPhone = parts[1].trim();
      } else {
        const phoneMatch = contact.match(/(\d{3}[-\.\s]?\d{3}[-\.\s]?\d{4})/);
        if (phoneMatch) {
          contactPhone = phoneMatch[1];
          contactPerson = contact.replace(phoneMatch[0], '').replace(/[\s·]+/g, '').trim();
        } else {
          contactPerson = contact;
        }
      }
    }

    return { name, contact, contactPerson, contactPhone, address, island };
  }).filter(r => r.name);
}

export async function GET() {
  const now = Date.now();
  if (customersCache && now - customersCache.ts < 10 * 60 * 1000) {
    return NextResponse.json({ customers: customersCache.data });
  }

  try {
    const token = getSSToken();
    const [active, completed, quoted] = await Promise.all([
      fetchCustomersFromSheet(token, SHEETS.active),
      fetchCustomersFromSheet(token, SHEETS.completed),
      fetchCustomersFromSheet(token, SHEETS.quoted),
    ]);

    // Aggregate by normalized name — active > quoted > completed
    const customerMap = new Map<string, CustomerRecord>();

    for (const row of [...active, ...quoted, ...completed]) {
      if (!row.name) continue;
      const key = row.name.toLowerCase().trim();
      if (customerMap.has(key)) {
        const existing = customerMap.get(key)!;
        existing.woCount++;
        if (!existing.contact && row.contact) existing.contact = row.contact;
        if (!existing.contactPerson && row.contactPerson) existing.contactPerson = row.contactPerson;
        if (!existing.contactPhone && row.contactPhone) existing.contactPhone = row.contactPhone;
        if (!existing.address && row.address) existing.address = row.address;
        if (!existing.island && row.island) existing.island = row.island;
      } else {
        customerMap.set(key, {
          name: toTitleCase(row.name),
          contact: row.contact,
          contactPerson: row.contactPerson,
          contactPhone: row.contactPhone,
          address: row.address,
          island: row.island,
          woCount: 1,
        });
      }
    }

    const customers = [...customerMap.values()].sort((a, b) => b.woCount - a.woCount);

    customersCache = { data: customers, ts: now };
    return NextResponse.json({ customers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, customers: [] }, { status: 500 });
  }
}
