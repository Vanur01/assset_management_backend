import dotenv from "dotenv";
import { createServer } from "http";
import mongoose from "mongoose";
import app from "./src/app.js";
import connectDB from "./src/config/mongoDB.js";
import logger from "./src/utils/logger.js";

// Load environment variables
dotenv.config();

// Use Render dynamic port
const PORT = process.env.PORT || 9001;
const NODE_ENV = process.env.NODE_ENV || "development";

// ==================== GLOBAL VARIABLES ====================
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
      `);
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error("❌ Server error:", error);
      }
    });

  } catch (error) {
    logger.error("❌ Server start failed:", error);
    process.exit(1);
  }
};

// ==================== GRACEFUL SHUTDOWN ====================

const gracefulShutdown = async (signal) => {
  logger.info(`⚠️ ${signal} received. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info("🛑 HTTP server closed");

      try {
        await mongoose.connection.close(false);
        logger.info("🗄️ MongoDB connection closed");

        logger.info("✅ Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("❌ Error during shutdown:", error);
        process.exit(1);
      }
    });

    // Force shutdown after 30s
    setTimeout(() => {
      logger.error("⏳ Forced shutdown due to timeout");
      process.exit(1);
    }, 30000);
  }
};

// ==================== SIGNAL HANDLERS ====================
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ==================== ERROR HANDLERS ====================

process.on("uncaughtException", (err) => {
  logger.error("💥 UNCAUGHT EXCEPTION!", {
    error: err.message,
    stack: err.stack,
    name: err.name,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("💥 UNHANDLED REJECTION!", {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });
  process.exit(1);
});

// ==================== START SERVER ====================
startServer();
