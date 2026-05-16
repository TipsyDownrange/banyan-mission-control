import { classifyEmail } from '@/lib/inbox/classify-email';

describe('BAN-246 inbox classifier', () => {
  it('does not classify flight booking emails as change orders', () => {
    const result = classifyEmail('Your flight is booked: MRQJOV to Honolulu', 'Tia Omura <tia@kulaglass.com>', 'Flight itinerary and confirmation code for Sean');
    expect(result.category).toBe('internal');
    expect(result.priority).toBe('low');
    expect(result.kaiNote).toContain('Travel/admin');
  });

  it('does not classify hotel reservations as change orders', () => {
    const result = classifyEmail('Your reservation 329-964-681 for Nathan Nakamura', 'hotel@example.com', 'Hotel reservation confirmation for Honolulu travel');
    expect(result.category).toBe('internal');
    expect(result.priority).toBe('low');
  });

  it('still classifies real change-order terms as change orders', () => {
    const result = classifyEmail('PCD 014 bulletin pricing request', 'gc@example.com', 'Please price the change notice and return proposal');
    expect(result.category).toBe('change_order');
    expect(result.priority).toBe('high');
  });

  it('does not suppress real Honolulu change-order work as travel admin', () => {
    const result = classifyEmail('Change order for Honolulu storefront bulletin', 'gc@example.com', 'Please price PCD 018 for the Honolulu project');
    expect(result.category).toBe('change_order');
  });
});
