import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

// Local storage for uploads
const uploadRoot = process.env.UPLOAD_PATH || "./public/uploads";

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'checklists';
    // Check for Excel/Spreadsheet files
    if (file.mimetype.includes('spreadsheet') || 
        file.mimetype.includes('excel') ||
        file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      folder = 'imports';
    }
    const fullPath = path.join(uploadRoot, folder);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/pdf',
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ];
  
  // For Excel imports specifically, we want to validate
  if (req.originalUrl.includes('/import-excel')) {
    // Strict validation for Excel imports
    const excelMimeTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    
    if (excelMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only Excel files (.xlsx, .xls, .csv) are allowed for import. Received: ${file.mimetype}`), false);
    }
  } else {
    // For other uploads (checklist attachments, etc.)
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
    }
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});