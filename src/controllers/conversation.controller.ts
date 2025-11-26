import { Request, Response } from 'express';
import {
  sessionService,
  SessionData,
  ConversationState,
} from '../services/session.service';
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
          // Primeiro contato: saudação + confirmação de nome
          responseText = await this.handleGreeting(session);

          nextState = 'CONFIRM_NAME';
          await sessionService.updateSession(currentSessionId, {
            state: nextState,
          });

          session = { ...session, state: nextState };
          break;
        }

        case 'CONFIRM_NAME': {
          if (!message || typeof message !== 'string') {
            // Sem mensagem útil — repete a saudação
            responseText = templateService.render(
              'greeting',
              session.templateData
            );
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

          const {
            response,
            nextState: computedState,
            attempts,
          } = await this.handleDocumentRequest(session, message);

          responseText = response;
          nextState = computedState;
          session = {
            ...session,
            state: nextState,
            validationAttempts: attempts,
          };
          break;
        }

          case 'VALIDATED': {
            // Se por algum motivo chegar aqui sem mensagem (não é o comum), só repete o sucesso
            if (!message || typeof message !== 'string') {
              responseText = templateService.render(
                'validation-success',
                session.templateData
              );
              nextState = session.state;
              break;
            }

            const lower = message.toLowerCase();

            if (lower.includes('cartao') || lower.includes('cartão')) {
              responseText =
                `Ótima escolha, ${session.templateData.firstName}! 💳\n\n` +
                `Nesta simulação, eu só validei sua identidade, ` +
                `mas aqui é onde o fluxo real mostraria as opções de cartão de crédito ` +
                `do ${session.templateData.companyName}.`;
            } else if (
              lower.includes('emprestimo') ||
              lower.includes('empréstimo') ||
              lower.includes('financiamento')
            ) {
              responseText =
                `Perfeito, ${session.templateData.firstName}! 📊\n\n` +
                `Nesta demo, eu paro na etapa de validação, ` +
                `mas aqui é onde eu apresentaria as condições de empréstimo e financiamento ` +
                `personalizadas para você.`;
            } else if (lower.includes('invest') || lower.includes('investimento')) {
              responseText =
                `Adorei, ${session.templateData.firstName}! 📈\n\n` +
                `No fluxo completo, esta parte mostraria oportunidades de investimento ` +
                `adaptadas ao seu perfil. Na nossa simulação, eu fico só na validação mesmo.`;
            } else if (lower.includes('seguro')) {
              responseText =
                `Muito bem, ${session.templateData.firstName}! 🛡️\n\n` +
                `Aqui é onde, em produção, eu traria opções de seguros do ${session.templateData.companyName}. ` +
                `Na versão de teste, a gente encerra depois da validação.`;
            } else {
              // Mensagem qualquer depois de validado
              responseText =
                `${session.templateData.firstName}, sua identidade já foi validada ✅\n\n` +
                `Essa simulação da Mia é focada só na etapa de validação de CPF/CNPJ. ` +
                `No fluxo real, a partir daqui eu seguiria com a oferta de produtos. 😉`;
            }

            nextState = 'CLOSED';
            await sessionService.updateSession(currentSessionId, {
              state: nextState,
            });
            session = { ...session, state: nextState };
            break;
          }


        case 'CLOSED': {
          // Conversa já encerrada: responde algo neutro ou reinicia
          responseText = templateService.render(
            'timeout-end',
            session.templateData
          );
          nextState = 'CLOSED';
          break;
        }

        default: {
          // Qualquer outro estado estranho, volta pro começo
          logger.warn('Unknown conversation state, resetting.', {
            state: session.state,
            sessionId: currentSessionId,
          });

          responseText = templateService.render(
            'greeting',
            session.templateData
          );
          nextState = 'CONFIRM_NAME';

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
    const normalized = message.trim().toLowerCase();

    const affirmative =
      /^(sim|s|yes|y|isso|correto|sou eu|sou)$/.test(normalized);
    const negative = /^(não|nao|n|no|não sou|nao sou)$/i.test(normalized);

    if (affirmative) {
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
    }

    if (negative) {
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

    // Resposta ambígua → reforça a pergunta
    const response = templateService.render(
      'greeting',
      session.templateData
    );
    return {
      response,
      nextState: 'CONFIRM_NAME',
    };
  }

  private sanitizeDocument(raw: string): string {
    return raw.replace(/\D/g, '');
  }

  private async handleDocumentRequest(
    session: SessionData,
    message: string
  ): Promise<{
    response: string;
    nextState: ConversationState;
    attempts: number;
  }> {
    const cleanDocument = this.sanitizeDocument(message);
    const isCPF = session.templateData.isCPF;

    // Validação básica de formato antes de chamar o serviço
    if (
      !cleanDocument ||
      (isCPF && cleanDocument.length !== 11) ||
      (!isCPF && cleanDocument.length !== 14)
    ) {
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
      }

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

    // Chama validação real
    const result = await validationService.validateCustomer(
      cleanDocument,
      isCPF ? 'CPF' : 'CNPJ',
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
