import { Request, Response } from 'express';
import { sessionService, SessionData, ConversationState } from '../services/session.service';
import { llmService } from '../services/llm.service';
import { validationService } from '../services/validation.service';
import { templateService } from '../services/template.service';
import { logger } from '../utils/logger';

export class ConversationController {
  async handleMessage(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, message, customerId } = req.body as {
        sessionId?: string;
        message?: string;
        customerId?: string;
      };

      // Primeira mensagem precisa de customerId
      if (!sessionId && !customerId) {
        res.status(400).json({
          success: false,
          error: 'customerId é obrigatório na primeira mensagem',
        });
        return;
      }

      // Buscar sessão existente
      let session: SessionData | null = null;

      if (sessionId) {
        session = await sessionService.getSession(sessionId);
      }

      // Se não existir, criar nova
      if (!session) {
        session = await sessionService.createSession(
          customerId as string,
          sessionId,
          'chat'
        );
      }

      const currentSessionId = session.sessionId;
      if (!currentSessionId) {
        logger.error('Session without sessionId', { session });
        res.status(500).json({
          success: false,
          error: 'Session id not found',
        });
        return;
      }

      let responseText = '';
      let nextState: ConversationState = session.state;

      switch (session.state) {
        case 'GREETING': {
          // Primeiro contato: só dá o texto de boas-vindas e já muda pra CONFIRM_NAME
          responseText = await this.handleGreeting(session);

          nextState = 'CONFIRM_NAME';
          await sessionService.updateSession(currentSessionId, {
            state: nextState,
          });

          // também atualiza o objeto em memória pra resposta ficar coerente
          session = { ...session, state: nextState };
          break;
        }

        case 'CONFIRM_NAME': {
          if (!message || typeof message !== 'string') {
            // Sem mensagem útil — repete algo amigável (pode trocar template)
            responseText = templateService.render('greeting', session.templateData);
            nextState = session.state;
            break;
          }

          const { response, nextState: computedState } =
            await this.handleNameConfirmation(session, message);

          responseText = response;
          nextState = computedState;
          session = { ...session, state: nextState };
          break;
        }

        case 'REQUEST_DOCUMENT': {
          if (!message || typeof message !== 'string') {
            responseText = templateService.render(
              'request-document',
              session.templateData
            );
            nextState = session.state;
            break;
          }

          const { response, nextState: computedState, attempts } =
            await this.handleDocumentRequest(session, message);

          responseText = response;
          nextState = computedState;
          session = {
            ...session,
            state: nextState,
            validationAttempts: attempts,
          };
          break;
        }

        // Outros estados (VALIDATED, CLOSED etc.) podem ser tratados aqui
        default: {
          responseText = templateService.render('greeting', session.templateData);
          nextState = 'GREETING';

          await sessionService.updateSession(currentSessionId, {
            state: nextState,
          });

          session = { ...session, state: nextState };
        }
      }

      res.json({
        success: true,
        response: responseText,
        state: nextState,
        sessionId: currentSessionId,
      });
    } catch (err: any) {
      console.error('Controller Error RAW:', err);

      logger.error('Controller Error', {
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  private async handleGreeting(session: SessionData): Promise<string> {
    return templateService.render('greeting', session.templateData);
  }

  private async handleNameConfirmation(
    session: SessionData,
    message: string
  ): Promise<{ response: string; nextState: ConversationState }> {
    const affirmative = /^(sim|s|yes|y|isso|correto)$/i.test(message.trim());

    if (affirmative) {
      // Cliente confirmou — pedir documento
      await sessionService.updateSession(session.sessionId, {
        state: 'REQUEST_DOCUMENT',
      });

      const response = templateService.render(
        'request-document',
        session.templateData
      );

      return {
        response,
        nextState: 'REQUEST_DOCUMENT',
      };
    } else {
      // Não é o cliente / não confirmou — encerra
      await sessionService.updateSession(session.sessionId, {
        state: 'CLOSED',
      });

      const response = templateService.render(
        'not-client',
        session.templateData
      );

      return {
        response,
        nextState: 'CLOSED',
      };
    }
  }

  private async handleDocumentRequest(
    session: SessionData,
    message: string
  ): Promise<{
    response: string;
    nextState: ConversationState;
    attempts: number;
  }> {
    const result = await validationService.validateCustomer(
      message,
      session.templateData.isCPF ? 'CPF' : 'CNPJ',
      session.conversationId,
      session.templateData.clientName
    );

    if (result.success) {
      await sessionService.updateSession(session.sessionId, {
        state: 'VALIDATED',
        isValidated: true,
      });

      const response = templateService.render(
        'validation-success',
        session.templateData
      );

      return {
        response,
        nextState: 'VALIDATED',
        attempts: session.validationAttempts ?? 0,
      };
    } else {
      const attempts = (session.validationAttempts ?? 0) + 1;

      if (attempts >= 3) {
        await sessionService.updateSession(session.sessionId, {
          state: 'CLOSED',
          validationAttempts: attempts,
        });

        const response = templateService.render(
          'validation-exceeded',
          session.templateData
        );

        return {
          response,
          nextState: 'CLOSED',
          attempts,
        };
      } else {
        await sessionService.updateSession(session.sessionId, {
          validationAttempts: attempts,
        });

        const response = templateService.render(
          'validation-failure',
          session.templateData
        );

        return {
          response,
          nextState: 'REQUEST_DOCUMENT',
          attempts,
        };
      }
    }
  }
}

export const conversationController = new ConversationController();
