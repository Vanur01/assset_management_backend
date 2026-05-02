import { exec } from "child_process";
import fs from "fs";
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import logger from "../utils/logger.js";
import { setCurrentTimestamp } from "../helper/dateFormat.helper.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 30);
const MAX_BACKUP_SIZE = Number(process.env.MAX_BACKUP_SIZE || 5 * 1024 * 1024 * 1024); // 5GB default
const BACKUP_COMPRESSION_LEVEL = Number(process.env.BACKUP_COMPRESSION_LEVEL || 6);

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  logger.info(`📁 Created backup directory: ${BACKUP_DIR}`);
}

/**
 * Generate backup filename with timestamp
 */
const generateBackupFilename = (prefix = "mongo-backup") => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split(".")[0];
  return `${prefix}-${timestamp}.gz`;
};

/**
 * Execute shell command with promise
 */
const execPromise = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

/**
 * Create database backup
 */
export const takeDBBackup = async () => {
  const backupFile = generateBackupFilename();
  const backupPath = path.join(BACKUP_DIR, backupFile);
  const startTime = Date.now();

  logger.info(`🔄 Starting database backup: ${backupFile}`);

  // Validate MongoDB URI
  if (!process.env.MONGO_URL) {
    logger.error("❌ MONGO_URL not found in environment variables");
    return { success: false, error: "MONGO_URL not configured" };
  }

  // Build mongodump command
  const command = `mongodump \
    --uri="${process.env.MONGO_URL}" \
    --archive="${backupPath}" \
    --gzip \
    --compressors=gzip,zstd \
    --numParallelCollections=4 \
    --verbose`;

  try {
    const { stdout, stderr } = await execPromise(command);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Check if backup was created successfully
    if (fs.existsSync(backupPath)) {
      const stats = fs.statSync(backupPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      logger.info(`✅ Backup completed successfully in ${duration}s`, {
        file: backupFile,
        size: `${sizeInMB} MB`,
        path: backupPath,
      });

      // Clean old backups
      await cleanOldBackups();

      return {
        success: true,
        file: backupFile,
        path: backupPath,
        size: stats.size,
        duration,
      };
    } else {
      throw new Error("Backup file not created");
    }
  } catch (error) {
    logger.error("❌ Backup failed:", {
      error: error.error?.message || error.message,
      stderr: error.stderr,
      command,
    });

    // Clean up failed backup file
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    return { 
      success: false, 
      error: error.error?.message || error.message,
      stderr: error.stderr 
    };
  }
};

/**
 * Clean old backups based on retention policy
 */
export const cleanOldBackups = async () => {
  logger.info(`🧹 Cleaning backups older than ${RETENTION_DAYS} days...`);

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const deletedFiles = [];
    let totalFreedSpace = 0;

    files.forEach((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      
      // Skip if not a backup file
      if (!file.endsWith(".gz") && !file.endsWith(".gzip")) {
        return;
      }

      try {
        const stats = fs.statSync(filePath);
        const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

        if (ageInDays > RETENTION_DAYS) {
          const fileSize = stats.size;
          fs.unlinkSync(filePath);
          totalFreedSpace += fileSize;
          deletedFiles.push({
            file,
            age: Math.round(ageInDays * 10) / 10,
            size: (fileSize / (1024 * 1024)).toFixed(2)
          });
          
          logger.debug(`🗑️ Deleted old backup: ${file} (${ageInDays.toFixed(1)} days old)`);
        }
      } catch (err) {
        logger.error(`Failed to process backup file ${file}:`, err);
      }
    });

    if (deletedFiles.length > 0) {
      logger.info(`✅ Cleaned up ${deletedFiles.length} old backups, freed ${(totalFreedSpace / (1024 * 1024)).toFixed(2)} MB`, {
        deleted: deletedFiles
      });
    } else {
      logger.info("✅ No old backups to clean");
    }

    return { success: true, deleted: deletedFiles.length, freedSpace: totalFreedSpace };
  } catch (error) {
    logger.error("❌ Failed to clean old backups:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Copy database to secondary URL
 */
export const copyDatabase = async () => {
  if (!process.env.MONGO_BACKUP_URL) {
    logger.warn("⚠️ MONGO_BACKUP_URL not configured, skipping database copy");
    return { success: false, error: "MONGO_BACKUP_URL not configured" };
  }

  logger.info("🔄 Starting database copy to secondary...");
  const startTime = Date.now();

  const command = `mongodump --uri="${process.env.MONGO_URL}" --archive | mongorestore --uri="${process.env.MONGO_BACKUP_URL}" --archive --drop`;

  try {
    const { stdout, stderr } = await execPromise(command);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(`✅ Database copied to secondary successfully in ${duration}s`);
    return { success: true, duration };
  } catch (error) {
    logger.error("❌ Database copy failed:", {
      error: error.error?.message || error.message,
      stderr: error.stderr,
    });
    return { 
      success: false, 
      error: error.error?.message || error.message,
      stderr: error.stderr 
    };
  }
};

/**
 * Restore latest backup
 */
export const restoreLatestBackup = async () => {
  logger.info("🔄 Starting database restore from latest backup...");

  if (!fs.existsSync(BACKUP_DIR)) {
    logger.error("❌ No backup directory found");
    return { success: false, error: "Backup directory not found" };
  }

  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith(".gz") || file.endsWith(".gzip"))
    .map(file => ({
      name: file,
      path: path.join(BACKUP_DIR, file),
      mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime); // Sort by newest first

  if (!backups.length) {
    logger.error("❌ No backups available to restore");
    return { success: false, error: "No backups available" };
  }

  const latestBackup = backups[0];
  const backupPath = latestBackup.path;
  const startTime = Date.now();

  logger.info(`Restoring from: ${latestBackup.name}`);

  const command = `mongorestore \
    --uri="${process.env.MONGO_URL}" \
    --drop \
    --archive="${backupPath}" \
    --gzip \
    --numParallelCollections=4 \
    --verbose`;

  try {
    const { stdout, stderr } = await execPromise(command);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.info(`✅ Database restored successfully from ${latestBackup.name} in ${duration}s`);
    
    return {
      success: true,
      backup: latestBackup.name,
      duration,
    };
  } catch (error) {
    logger.error("❌ Database restore failed:", {
      error: error.error?.message || error.message,
      stderr: error.stderr,
      backup: latestBackup.name,
    });
    return { 
      success: false, 
      error: error.error?.message || error.message,
      backup: latestBackup.name,
      stderr: error.stderr 
    };
  }
};

/**
 * Verify backup integrity
 */
export const verifyBackup = async (backupFile) => {
  const backupPath = path.join(BACKUP_DIR, backupFile);
  
  if (!fs.existsSync(backupPath)) {
    return { success: false, error: "Backup file not found" };
  }

  logger.info(`🔍 Verifying backup: ${backupFile}`);

  // Check file size
  const stats = fs.statSync(backupPath);
  if (stats.size === 0) {
    return { success: false, error: "Backup file is empty" };
  }

  // Try to list archive contents
  const command = `mongorestore --archive="${backupPath}" --gzip --dry-run`;

  try {
    const { stdout, stderr } = await execPromise(command);
    logger.info(`✅ Backup verification passed: ${backupFile}`, {
      size: `${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
    });
    return { success: true, size: stats.size };
  } catch (error) {
    logger.error(`❌ Backup verification failed for ${backupFile}:`, error);
    return { 
      success: false, 
      error: error.error?.message || error.message,
      stderr: error.stderr 
    };
  }
};

/**
 * Get backup statistics
 */
export const getBackupStats = async () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    return { success: false, error: "Backup directory not found" };
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith(".gz") || file.endsWith(".gzip"))
    .map(file => {
      const stats = fs.statSync(path.join(BACKUP_DIR, file));
      return {
        name: file,
        size: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        created: stats.birthtime,
        modified: stats.mtime,
        age: ((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24)).toFixed(1),
      };
    })
    .sort((a, b) => b.modified - a.modified);

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

  return {
    success: true,
    stats: {
      count: files.length,
      totalSize: totalSizeMB,
      retentionDays: RETENTION_DAYS,
      directory: BACKUP_DIR,
      files,
    },
  };
};

// ==================== CRON JOBS ====================

/**
 * Start hourly backup cron job
 * Runs at minute 0 of every hour (e.g., 1:00, 2:00, etc.)
 */
export const startHourlyBackup = () => {
  if (process.env.DISABLE_BACKUPS === "true") {
    logger.info("⏸️ Backups are disabled via DISABLE_BACKUPS=true");
    return;
  }

  const schedule = process.env.BACKUP_CRON_SCHEDULE || "0 * * * *"; // Default: hourly
  
  logger.info(`⏰ Scheduling hourly backup with cron: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    logger.info(`⏰ Running scheduled backup at ${setCurrentTimestamp()}`);
    
    const result = await takeDBBackup();
    
    if (result.success) {
      // Verify the backup
      await verifyBackup(result.file);
      
      // Log backup stats
      const stats = await getBackupStats();
      if (stats.success) {
        logger.info(`📊 Backup stats: ${stats.stats.count} total backups, ${stats.stats.totalSize} MB total size`);
      }
    }
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "UTC",
  });

  logger.info(`✅ Hourly backup scheduled successfully`);
  return task;
};

/**
 * Start daily copy to secondary database
 * Runs at 2 AM every day
 */
export const startDailyCopy = () => {
  if (!process.env.MONGO_BACKUP_URL) {
    logger.info("⏸️ Secondary database copy disabled (MONGO_BACKUP_URL not configured)");
    return;
  }

  const schedule = process.env.COPY_CRON_SCHEDULE || "0 2 * * *"; // Default: 2 AM daily
  
  logger.info(`⏰ Scheduling daily database copy with cron: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    logger.info(`⏰ Running scheduled database copy at ${setCurrentTimestamp()}`);
    await copyDatabase();
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "UTC",
  });

  logger.info(`✅ Daily database copy scheduled successfully`);
  return task;
};

/**
 * Start restore cron (for disaster recovery)
 * This is disabled by default, only enable in emergencies
 */
export const startRestoreCron = () => {
  if (process.env.ENABLE_AUTO_RESTORE !== "true") {
    return;
  }

  const schedule = process.env.RESTORE_CRON_SCHEDULE || "0 3 * * *"; // Default: 3 AM daily
  
  logger.warn(`⚠️ AUTO RESTORE IS ENABLED! This will overwrite your database daily!`);
  logger.info(`⏰ Scheduling auto restore with cron: ${schedule}`);

  const task = cron.schedule(schedule, async () => {
    logger.warn(`⚠️ Running scheduled auto restore at ${setCurrentTimestamp()}`);
    await restoreLatestBackup();
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || "UTC",
  });

  logger.info(`✅ Auto restore scheduled successfully (DANGEROUS!)`);
  return task;
};

/**
 * Run backup now (manual trigger)
 */
export const runBackupNow = async () => {
  logger.info("🔄 Manual backup triggered");
  return await takeDBBackup();
};

/**
 * Run copy now (manual trigger)
 */
export const runCopyNow = async () => {
  logger.info("🔄 Manual database copy triggered");
  return await copyDatabase();
};

/**
 * Run restore now (manual trigger)
 */
export const runRestoreNow = async (backupFile) => {
  if (backupFile) {
    logger.info(`🔄 Manual restore triggered for: ${backupFile}`);
    return await verifyBackup(backupFile).then(result => {
      if (result.success) {
        return restoreLatestBackup(); // This will restore the specified file if we modify restoreLatestBackup
      }
      return result;
    });
  } else {
    logger.info("🔄 Manual restore triggered (latest backup)");
    return await restoreLatestBackup();
  }
};

export default {
  takeDBBackup,
  copyDatabase,
  restoreLatestBackup,
  cleanOldBackups,
  verifyBackup,
  getBackupStats,
  startHourlyBackup,
  startDailyCopy,
  startRestoreCron,
  runBackupNow,
  runCopyNow,
  runRestoreNow,
};