import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { sanitizeDocument } from '../utils/sanitize';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface ValidationResult {
  success: boolean;
  validationId: string;
  customer: {
    isValid: boolean;
    matchesExpectedClient: boolean;
    documentType: string;
    maskedDocument?: string;
    accountStatus?: string;
  };
  nextSteps: {
    allowProductOffer: boolean;
    suggestedProducts: any[];
  };
  security: {
    riskLevel: string;
    attemptsRemaining: number;
  };
  errors?: Array<{
    code: string;
    message: string;
    userMessage: string;
  }>;
}

class ValidationService {
  async validateCustomer(
    document: string,
    documentType: 'CPF' | 'CNPJ',
    sessionId: string,
    expectedClientName: string
  ): Promise<ValidationResult> {
    const validationId = `val_${Date.now()}`;
    
    try {
      // Sanitizar documento
      const sanitized = sanitizeDocument(document);
      
      // Validar formato
      const isValidFormat = this.validateFormat(sanitized, documentType);
      if (!isValidFormat) {
        return this.buildErrorResponse(validationId, 'INVALID_FORMAT', documentType);
      }
      
      // Hash do documento (nunca armazenar em texto plano)
      const documentHash = await bcrypt.hash(sanitized, 10);
      
      // Simular validação (em produção, chamar API do banco)
      const isValid = await this.mockValidation(sanitized, documentType);
      
      // Registrar tentativa
      await prisma.validationLog.create({
        data: {
          sessionId,
          documentHash,
          documentType,
          isValid,
        },
      });
      
      if (!isValid) {
        return this.buildErrorResponse(validationId, 'DOCUMENT_NOT_FOUND', documentType);
      }
      
      // Sucesso
      return {
        success: true,
        validationId,
        customer: {
          isValid: true,
          matchesExpectedClient: true,
          documentType,
          maskedDocument: this.maskDocument(sanitized, documentType),
          accountStatus: 'active',
        },
        nextSteps: {
          allowProductOffer: true,
          suggestedProducts: [
            {
              id: 'credit_card_gold',
              name: 'Cartão Gold',
              type: 'credit_card',
              preApproved: true,
              limit: 15000,
            },
          ],
        },
        security: {
          riskLevel: 'low',
          attemptsRemaining: 2,
        },
      };
    } catch (error) {
      logger.error('Validation Error', { error, sessionId });
      return this.buildErrorResponse(validationId, 'SYSTEM_ERROR', documentType);
    }
  }

  private validateFormat(document: string, type: 'CPF' | 'CNPJ'): boolean {
    if (type === 'CPF') {
      return /^\d{11}$/.test(document);
    } else {
      return /^\d{14}$/.test(document);
    }
  }

  private async mockValidation(document: string, type: string): Promise<boolean> {
    // Mock: aceitar qualquer documento que não seja todos dígitos iguais
    const allSame = /^(\d)\1+$/.test(document);
    return !allSame;
  }

  private maskDocument(document: string, type: 'CPF' | 'CNPJ'): string {
    if (type === 'CPF') {
      // XXX.XXX.XXX-12
      return `***.***.***.${document.slice(-2)}`;
    } else {
      // XX.XXX.XXX/XXXX-12
      return `**.***.***/****-${document.slice(-2)}`;
    }
  }

  private buildErrorResponse(
    validationId: string,
    errorCode: string,
    documentType: string
  ): ValidationResult {
    const errorMessages: Record<string, string> = {
      INVALID_FORMAT: `${documentType} inválido. ${documentType === 'CPF' ? 'CPF deve ter 11 dígitos' : 'CNPJ deve ter 14 dígitos'}.`,
      DOCUMENT_NOT_FOUND: 'Não consegui validar o documento informado. Por favor, verifique se digitou corretamente.',
      SYSTEM_ERROR: 'Estou com uma instabilidade técnica momentânea. Tente novamente em alguns minutos.',
    };

    return {
      success: false,
      validationId,
      customer: {
        isValid: false,
        matchesExpectedClient: false,
        documentType,
      },
      nextSteps: {
        allowProductOffer: false,
        suggestedProducts: [],
      },
      security: {
        riskLevel: 'medium',
        attemptsRemaining: 1,
      },
      errors: [
        {
          code: errorCode,
          message: errorMessages[errorCode],
          userMessage: errorMessages[errorCode],
        },
      ],
    };
  }
}

export const validationService = new ValidationService();