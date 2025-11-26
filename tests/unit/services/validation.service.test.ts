import { describe, it, expect } from 'vitest';
import { validationService } from '../../../src/services/validation.service';

describe('ValidationService', () => {
  it('should validate CPF format correctly', async () => {
    const result = await validationService.validateCustomer(
      '12345678900',
      'CPF',
      'test-session',
      'Pedro Silva'
    );
    
    expect(result.customer.documentType).toBe('CPF');
  });

  it('should reject invalid CPF format', async () => {
    const result = await validationService.validateCustomer(
      '123',
      'CPF',
      'test-session',
      'Pedro Silva'
    );
    
    expect(result.success).toBe(false);
    expect(result.errors?.[0].code).toBe('INVALID_FORMAT');
  });
});