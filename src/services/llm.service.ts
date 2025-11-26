import OpenAI from 'openai';
import { templateService, TemplateData } from './template.service';
import { logger } from '../utils/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

export interface LLMResponse {
  message: string;
  functionCall?: FunctionCall;
  finishReason: string;
}

class LLMService {
  private model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

  async chat(
    messages: LLMMessage[],
    templateData: TemplateData,
    functions?: any[]
  ): Promise<LLMResponse> {
    try {
      // Adicionar system prompt
      const systemPrompt = templateService.renderSystemPrompt(templateData);
      
      const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ];

      const completion = await openai.chat.completions.create({
        model: this.model,
        messages: allMessages,
        functions: functions,
        function_call: functions ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 500,
      });

      const choice = completion.choices[0];
      
      logger.info('LLM Response', {
        finishReason: choice.finish_reason,
        hasFunctionCall: !!choice.message.function_call,
      });

      return {
        message: choice.message.content || '',
        functionCall: choice.message.function_call ? {
          name: choice.message.function_call.name,
          arguments: JSON.parse(choice.message.function_call.arguments),
        } : undefined,
        finishReason: choice.finish_reason,
      };
    } catch (error) {
      logger.error('LLM Error', { error });
      throw error;
    }
  }
}

export const llmService = new LLMService();