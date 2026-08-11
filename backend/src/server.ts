import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import dotenv from 'dotenv';
import { registerInterviewHandlers } from './handlers/interviewHandler';
import { initSessionStore, flushSessionStore } from './routes/sessions';

// Load environment variables
dotenv.config();

// Production fail-fast: JWT_SECRET must be a real, strong secret. The dev
// fallback in services/jwtSecret.ts is for local runs only and must never be
// relied on when real accounts exist (anyone who knows the fallback value can
// forge tokens for any user).
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[Security] Refusing to start in production: JWT_SECRET must be set.');
  process.exit(1);
}

const port = process.env.PORT || 3000;
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings matching frontend origin
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Register /interview namespace handlers
const interviewNamespace = io.of('/interview');
registerInterviewHandlers(interviewNamespace);


// Boot the server listener (after the session store is ready)
initSessionStore()
  .then(() => {
    server.listen(port, () => {
      console.log(`=================================================`);
      console.log(`InterviewPilot Core API running on: http://localhost:${port}`);
      console.log(`WebSocket namespaces initialized at: ws://localhost:${port}/interview`);
      console.log(`=================================================`);
    });
  })
  .catch((err) => {
    console.error('[Server] Failed to initialize session store:', (err as Error).message);
    process.exit(1);
  });

// Flush pending session writes on shutdown
async function shutdown(signal: string) {
  console.log(`[Server] ${signal} received, flushing session store...`);
  try {
    await flushSessionStore();
  } catch (err) {
    console.error('[Server] Error flushing session store:', (err as Error).message);
  }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
