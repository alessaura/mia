import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

export type ConversationState =
  | 'GREETING'
  | 'CONFIRM_NAME'
  | 'REQUEST_DOCUMENT'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'REENGAGE_1'
  | 'REENGAGE_2'
  | 'TIMEOUT'
  | 'CLOSED';

export interface SessionData {
  id: string;
  sessionId: string;
  conversationId: string;
  customerId: string;
  state: ConversationState;
  validationAttempts: number;
  isValidated: boolean;
  lastMessageAt: Date;
  templateData: {
    companyName: string;
    clientName: string;
    firstName: string;
    isCPF: boolean;
  };
}

class SessionService {
  async init(): Promise<void> {
    if (!redis.isOpen) {
      await redis.connect();
      console.log('Redis connected ✅');
    }
  }

  async getSession(sessionId?: string): Promise<SessionData | null> {
    if (!sessionId) return null;

    const cached = await redis.get(`session:${sessionId}`);

    if (cached) {
      return JSON.parse(cached) as SessionData;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { sessionId },
      include: { customer: true },
    });

    if (!conversation) {
      return null;
    }

    const sessionData: SessionData = {
      id: conversation.id,
      sessionId,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      state: conversation.state as ConversationState,
      validationAttempts: conversation.validationAttempts,
      isValidated: conversation.isValidated,
      lastMessageAt: conversation.lastMessageAt,
      templateData: {
        companyName: 'Banco Nova Era',
        clientName: conversation.customer.clientName,
        firstName: conversation.customer.firstName,
        isCPF: conversation.customer.documentType === 'CPF',
      },
    };

    await redis.setEx(`session:${sessionId}`, 3600, JSON.stringify(sessionData));

    return sessionData;
  }

  async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<void> {
    if (!sessionId) return;

    await prisma.conversation.update({
      where: { sessionId },
      data: {
        state: updates.state,
        validationAttempts: updates.validationAttempts,
        isValidated: updates.isValidated,
        lastMessageAt: new Date(),
      },
    });

    await redis.del(`session:${sessionId}`);
  }

  async createSession(
    customerId: string,
    sessionId: string | undefined,
    channel: string
  ): Promise<SessionData> {
    if (!customerId) {
      throw new Error('customerId is required to create a session');
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const finalSessionId = sessionId || randomUUID();

    const conversation = await prisma.conversation.create({
      data: {
        customerId,
        sessionId: finalSessionId,
        channel,
        state: 'GREETING',
        validationAttempts: 0,
        isValidated: false,
        lastMessageAt: new Date(),
      },
    });

    const sessionData: SessionData = {
      id: conversation.id,
      sessionId: finalSessionId,
      conversationId: conversation.id,
      customerId,
      state: 'GREETING',
      validationAttempts: 0,
      isValidated: false,
      lastMessageAt: conversation.lastMessageAt,
      templateData: {
        companyName: 'Banco Nova Era',
        clientName: customer.clientName,
        firstName: customer.firstName,
        isCPF: customer.documentType === 'CPF',
      },
    };

    await redis.setEx(`session:${finalSessionId}`, 3600, JSON.stringify(sessionData));

    return sessionData;
  }
}

export const sessionService = new SessionService();
