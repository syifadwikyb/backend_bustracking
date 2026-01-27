import cron from 'node-cron';
import { Op } from 'sequelize';
import TrackingHistory from '../api/models/TrackingHistory.js'; 

const startCleanupJob = () => {
    console.log('✅ Sistem Cron Job (Auto-Cleanup) telah aktif.');

    cron.schedule('0 2 * * *', async () => { 
        console.log('⏰ [CRON] Memulai pembersihan data history lama...');

        try {
            const retentionDate = new Date();
            retentionDate.setMonth(retentionDate.getMonth() - 3); 

            const deletedCount = await TrackingHistory.destroy({
                where: {
                    created_at: {
                        [Op.lt]: retentionDate 
                    }
                }
            });

            if (deletedCount > 0) {
                console.log(`✅ [CRON] Berhasil menghapus ${deletedCount} baris data yang lebih tua dari 3 bulan.`);
            } else {
                console.log(`ℹ️ [CRON] Database bersih. Tidak ada data > 3 bulan yang perlu dihapus hari ini.`);
            }

        } catch (error) {
            console.error('❌ [CRON] Gagal melakukan pembersihan:', error);
        }
    });
};

export default startCleanupJob;