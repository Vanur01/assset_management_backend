import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { createClient } from "redis";

let limiter;

if (process.env.REDIS_URL) {
  const client = createClient({ url: process.env.REDIS_URL });
  client.connect().catch(console.error);

  limiter = rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
  });
} else {
  limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
  });
}

export default limiter;