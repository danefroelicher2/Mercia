import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeOasisCore } from './services/oasisCore';
import { errorHandler } from './middleware/errorHandler';

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

// API routes (will add in next prompt)
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Oasis AI API',
    version: '0.1.0',
    endpoints: {
      auth: '/api/auth/*',
      questions: '/api/questions/*',
      memory: '/api/memory/*',
      chat: '/api/chat/*',
    },
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Initialize Oasis AI Core
    initializeOasisCore();

    app.listen(PORT, () => {
      console.log(`\n  Oasis AI Backend running on port ${PORT}`);
      console.log(`  Health check: http://localhost:${PORT}/health`);
      console.log(`  API info: http://localhost:${PORT}/api\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
