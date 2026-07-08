import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeMerciaCore } from './services/merciaCore';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import routineRoutes from './routes/routine';
import statsRoutes from './routes/stats';
import summaryRoutes from './routes/summaries';
import gymRoutes from './routes/gym';
import notificationRoutes from './routes/notifications';
import cronRoutes from './routes/cron';

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
    service: 'Mercia',
    version: '0.1.0',
  });
});

// API info
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Mercia API',
    version: '0.1.0',
    endpoints: {
      auth: '/api/auth/*',
      chat: '/api/chat/*',
      routine: '/api/routine/*',
      stats: '/api/stats/*',
    },
  });
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/routine', routineRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/gym', gymRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cron', cronRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Initialize Mercia Core
    initializeMerciaCore();

    console.log('  All jobs scheduled via Supabase pg_cron (see docs/cron-setup.md)');
    console.log('  Cron trigger endpoints: /api/cron/* (protected by CRON_SECRET)');

    app.listen(PORT, () => {
      console.log(`\n  Mercia Backend running on port ${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/health`);
      console.log(`  API info: http://localhost:${PORT}/api`);
      console.log(`\n  Available endpoints:`);
      console.log(`   POST /api/auth/register`);
      console.log(`   POST /api/auth/login`);
      console.log(`   POST /api/auth/refresh`);
      console.log(`   POST /api/chat/new`);
      console.log(`   GET  /api/chat/list`);
      console.log(`   GET  /api/chat/:chatId/messages`);
      console.log(`   POST /api/chat/message`);
      console.log(`   POST /api/routine/tasks`);
      console.log(`   GET  /api/routine/tasks/:day`);
      console.log(`   PATCH /api/routine/tasks/:id`);
      console.log(`   DELETE /api/routine/tasks/:id`);
      console.log(`   POST /api/routine/goals`);
      console.log(`   GET  /api/routine/goals/weekly`);
      console.log(`   GET  /api/routine/goals/monthly`);
      console.log(`   PATCH /api/routine/goals/:id`);
      console.log(`   DELETE /api/routine/goals/:id`);
      console.log(`   POST /api/routine/quotes/:quoteId/interact`);
      console.log(`   GET  /api/routine/quotes/like-counts`);
      console.log(`   GET  /api/routine/quotes/:quoteId/user-interaction`);
      console.log(`   GET  /api/routine/quotes/user-disliked`);
      console.log(`   GET  /api/stats/streaks`);
      console.log(`   GET  /api/stats/heatmap`);
      console.log(`   GET  /api/stats/achievements`);
      console.log(`   POST /api/stats/log-activity`);
      console.log(`   GET  /api/gym/log/:dayOfWeek`);
      console.log(`   POST /api/gym/log`);
      console.log(`   GET  /api/gym/week`);
      console.log(`   GET  /api/gym/memory`);
      console.log(`   GET  /api/gym/memory/:group`);
      console.log(`   DELETE /api/gym/memory/:group\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
