import dotenv from "dotenv";
import { createServer } from "http";
import mongoose from "mongoose";
import app from "./src/app.js";
import connectDB from "./src/config/mongoDB.js";
import logger from "./src/utils/logger.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 9001;
const NODE_ENV = process.env.NODE_ENV || "development";

// ==================== GRACEFUL SHUTDOWN ====================
let server;

// ==================== START SERVER ====================
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info("✅ MongoDB connected successfully");

    // Create HTTP server
    server = createServer(app);

    // Start listening
    server.listen(PORT, () => {
      logger.info(`
      🚀 Server is running!
      📡 Port: ${PORT}
      🌍 Environment: ${NODE_ENV}
      🔗 API: http://localhost:${PORT}/api/v1
      📊 Health: http://localhost:${PORT}/health
      ${process.env.ENABLE_API_DOCS === "true" ? `📚 API Docs: http://localhost:${PORT}/api-docs` : ""}
      `);
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error("Server error:", error);
      }
    });

  } catch (error) {
    logger.error("❌ Server start failed:", error);
    process.exit(1);
  }
};

// ==================== GRACEFUL SHUTDOWN HANDLERS ====================

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed");

      try {
        // Close MongoDB connection
        await mongoose.connection.close(false);
        logger.info("MongoDB connection closed");

        // Close other connections (Redis, etc.) if needed
        
        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    });

    // Force close if not closed within 30 seconds
    setTimeout(() => {
      logger.error("Forced shutdown due to timeout");
      process.exit(1);
    }, 30000);
  }
};

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ==================== UNCAUGHT ERRORS ====================

process.on("uncaughtException", (err) => {
  logger.error("UNCAUGHT EXCEPTION! 💥", {
    error: err.message,
    stack: err.stack,
    name: err.name,
  });
  
  // In production, give server time to handle current requests
  if (process.env.NODE_ENV === "production") {
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  } else {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("UNHANDLED REJECTION! 💥", {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });
  
  // In production, give server time to handle current requests
  if (process.env.NODE_ENV === "production") {
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  } else {
    process.exit(1);
  }
});

// ==================== START THE SERVER ====================
startServer();