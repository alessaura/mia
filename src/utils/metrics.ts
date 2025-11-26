import { Counter, Histogram, Registry } from 'prom-client';

export const register = new Registry();

export const conversationCounter = new Counter({
  name: 'mia_conversations_total',
  help: 'Total number of conversations',
  labelNames: ['state', 'channel'],
  registers: [register],
});

export const validationHistogram = new Histogram({
  name: 'mia_validation_duration_seconds',
  help: 'Validation duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});