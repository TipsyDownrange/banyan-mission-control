export type ServicePanelSearchableWO = {
  id: string;
  name: string;
  description: string;
  contact: string;
  island: string;
  address: string;
  assignedTo: string;
  legacy_wo_ids?: string;
};

export function serviceWOMatchesSearch(wo: ServicePanelSearchableWO, search: string): boolean {
  const q = search.toLowerCase();
  if (!q) return true;

  return (
    wo.name.toLowerCase().includes(q) ||
    wo.description.toLowerCase().includes(q) ||
    wo.contact.toLowerCase().includes(q) ||
    wo.island.toLowerCase().includes(q) ||
    wo.address.toLowerCase().includes(q) ||
    wo.id.toLowerCase().includes(q) ||
    wo.assignedTo.toLowerCase().includes(q) ||
    (wo.legacy_wo_ids || '').toLowerCase().includes(q)
  );
}
