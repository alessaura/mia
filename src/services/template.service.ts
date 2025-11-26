import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { logger } from '../utils/logger';

class TemplateService {
  private templates = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    try {
      // __dirname aqui é algo como /app/src/services
      const templatesDir = path.join(__dirname, '..', 'prompts');

      if (!fs.existsSync(templatesDir)) {
        logger.warn(`Templates directory not found: ${templatesDir}`);
        return;
      }

      const files = fs
        .readdirSync(templatesDir)
        .filter((file) => file.endsWith('.hbs'));

      for (const file of files) {
        const filePath = path.join(templatesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const name = path.basename(file, '.hbs'); // greeting.hbs -> greeting
        const template = Handlebars.compile(content);

        this.templates.set(name, template);
      }

      logger.info(
        `Loaded ${this.templates.size} templates from ${templatesDir}`
      );
    } catch (err: any) {
      logger.error('Error loading templates', {
        message: err?.message,
        stack: err?.stack,
      });
    }
  }

  render(name: string, data: any): string {
    const template = this.templates.get(name);

    if (!template) {
      // antes você jogava `throw new Error("Template 'greeting' not found")`
      // que derrubava a MIA inteira. Vamos ser mais gentis:
      logger.warn(`Template "${name}" not found. Using fallback.`);
      return `[${name}] ` + JSON.stringify(data);
    }

    return template(data);
  }
}

export const templateService = new TemplateService();
