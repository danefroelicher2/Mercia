import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeOasisCore } from './services/oasisCore';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth';
import questionRoutes from './routes/questions';
import memoryRoutes from './routes/memory';
import chatRoutes from './routes/chat';
import extractionRoutes from './routes/extraction';

// Import jobs
import { startExtractionCronJob } from './jobs/extractionJob';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Oasis AI',
    version: '0.1.0',
  });
});

// API info
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Oasis AI API',
    version: '0.1.0',
    endpoints: {
      auth: '/api/auth/*',
      questions: '/api/questions/*',
      memory: '/api/memory/*',
      chat: '/api/chat/*',
      extraction: '/api/extraction/*',
    },
  });
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/extraction', extractionRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Initialize Oasis AI Core
    initializeOasisCore();

    // Start cron job for daily chat extraction
    startExtractionCronJob();
    console.log('  Chat extraction cron job started (runs at 3:00 AM daily)');

    app.listen(PORT, () => {
      console.log(`\n  Oasis AI Backend running on port ${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/health`);
      console.log(`  API info: http://localhost:${PORT}/api`);
      console.log(`\n  Available endpoints:`);
      console.log(`   POST /api/auth/register`);
      console.log(`   POST /api/auth/login`);
      console.log(`   POST /api/auth/refresh`);
      console.log(`   GET  /api/questions/daily`);
      console.log(`   POST /api/questions/answer`);
      console.log(`   POST /api/questions/skip`);
      console.log(`   GET  /api/questions/progress`);
      console.log(`   GET  /api/questions/history`);
      console.log(`   GET  /api/memory/profile`);
      console.log(`   GET  /api/memory/summary`);
      console.log(`   POST /api/memory/feedback`);
      console.log(`   POST /api/chat/new`);
      console.log(`   GET  /api/chat/list`);
      console.log(`   GET  /api/chat/:chatId/messages`);
      console.log(`   POST /api/chat/message`);
      console.log(`   POST /api/extraction/trigger\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
