import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { conversationController } from './controllers/conversation.controller';
// se ainda não tiver esses middlewares, pode comentar essas linhas
// import { errorMiddleware } from './middleware/error.middleware';
// import { rateLimitMiddleware } from './middleware/rate-limit.middleware';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// se ainda não implementou rate limiting, comenta essa linha
// app.use(rateLimitMiddleware);

app.post(
  '/api/v1/conversation/message',
  conversationController.handleMessage.bind(conversationController)
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// se ainda não tiver error middleware, comenta essa linha
// app.use(errorMiddleware);

export default app;
