import { takeDBBackup, getBackupStats } from './src/cron/cron.service';

async function testBackup() {
  console.log('Testing database backup...');
  
  const result = await takeDBBackup();
  
  if (result.success) {
    console.log('✅ Backup successful!');
    console.log(`File: ${result.file}`);
    console.log(`Size: ${result.sizeMB} MB`);
    console.log(`Duration: ${result.duration}s`);
    
    // Get stats
    const stats = await getBackupStats();
    console.log('📊 Backup stats:', stats);
  } else {
    console.error('❌ Backup failed:', result.error);
    if (result.details) {
      console.error('Details:', result.details);
    }
  }
}

testBackup();