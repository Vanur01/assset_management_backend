export const generateFullUrl = (filePath) => {
  if (!filePath) return null;
  
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 9001}`;
  
  if (filePath.startsWith("http")) {
    return filePath;
  }
  
  return `${baseUrl}/public/uploads/${filePath}`;
};