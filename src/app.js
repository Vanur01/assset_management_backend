import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import hpp from "hpp";
import { fileURLToPath } from "url";
import apiV1Router from "./routes/index.js";
import globalErrorHandler from "./middlewares/globalErrorHandler.js";
import logger from "./utils/logger.js";
import { startHourlyBackup, startDailyCopy, startRestoreCron } from "./cron/dbBackup.cron.js";
//import { checkAndUpdateExpiredClients } from './cron/cron.service.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ==================== HEALTH CHECK ====================
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    memoryUsage: process.memoryUsage(),
  });
});

// ==================== CRON JOBS (only in production) ====================
if (process.env.NODE_ENV === "production") {
  try {
    startHourlyBackup();
    startRestoreCron();
    startDailyCopy();
    checkAndUpdateExpiredClients();
    logger.info("✅ Cron jobs started successfully");
  } catch (error) {
    logger.error("❌ Failed to start cron jobs:", error);
  }
}

// ==================== TRUST PROXY ====================
app.set("trust proxy", 1);

// ==================== CORS ====================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "https://asset-client-84k8.vercel.app"
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin || process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ==================== SECURITY MIDDLEWARE ====================
// Helmet with custom configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://*.amazonaws.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Data sanitization against NoSQL injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// ==================== BODY PARSER ====================
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

// ==================== COMPRESSION ====================
app.use(compression());

// ==================== REQUEST LOGGING ====================
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  });

  next();
});

// ==================== STATIC FILES ====================
// Serve static files with caching
app.use(
  "/public",
  express.static(path.join(__dirname, "../public"), {
    maxAge: process.env.NODE_ENV === "production" ? "30d" : "0",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webp") || filePath.endsWith(".jpg") || filePath.endsWith(".png")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// ==================== API ROUTES ====================
app.use("/api/v1", apiV1Router);

// ==================== API DOCUMENTATION (if enabled) ====================
if (process.env.ENABLE_API_DOCS === "true") {
  import("swagger-ui-express").then((swaggerUi) => {
    import("../swagger.json", { assert: { type: "json" } }).then((swaggerDocument) => {
      app.use("/api-docs", swaggerUi.default.serve, swaggerUi.default.setup(swaggerDocument.default));
      logger.info("✅ API documentation available at /api-docs");
    }).catch((err) => {
      logger.error("Failed to load swagger.json:", err);
    });
  }).catch((err) => {
    logger.error("Failed to load swagger-ui-express:", err);
  });
}

// ==================== 404 HANDLER ====================
app.use("*", (req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// ==================== ERROR HANDLING MIDDLEWARE ====================
app.use(globalErrorHandler);

export default app;