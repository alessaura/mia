export function sanitizeDocument(input: string): string {
  // Remove tudo exceto dígitos
  return input.replace(/[^\d]/g, '');
}

export function validateDocumentFormat(document: string, type: 'CPF' | 'CNPJ'): boolean {
  const sanitized = sanitizeDocument(document);
  
  if (type === 'CPF') {
    return /^\d{11}$/.test(sanitized);
  } else {
    return /^\d{14}$/.test(sanitized);
  }
}