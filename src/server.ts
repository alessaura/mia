import app from './app';
import { sessionService } from './services/session.service';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await sessionService.init();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Bootstrap error:', err);
});
