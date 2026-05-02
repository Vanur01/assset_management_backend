// import cron from 'node-cron';
// import Client from '../models/client.model.js';
// import Auth from '../models/auth.model.js';
// import { AppError } from '../errors/customError.js';
// import mongoose from 'mongoose';

// /* ==========================================================
//    EXPIRY CRON JOBS
//    Runs daily at midnight to check and update expired clients
// ========================================================== */

// // Schedule: 0 0 * * * (runs at midnight every day)
// export const initExpiryCronJobs = () => {
//     cron.schedule('0 * * * *', async () => {
//         console.log('Running hourly critical expiry check...', new Date().toISOString());
//         try {
//             await checkCriticalExpirations();
//         } catch (error) {
//             console.error('Error in hourly expiry check:', error);
//         }
//     });

// };

// /* ==========================================================
//    CHECK AND UPDATE EXPIRED CLIENTS
// ========================================================== */
// export const checkAndUpdateExpiredClients = async () => {
//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//         const now = new Date();

//         // Find all active clients that have expired
//         const expiredClients = await Client.find({
//             status: 'active',
//             expiryDate: { $lt: now }
//         }).session(session);

//         if (expiredClients.length === 0) {
//             await session.commitTransaction();
//             session.endSession();
//             return {
//                 processed: 0,
//                 updated: 0,
//                 autoRenewed: 0,
//                 message: 'No expired clients found'
//             };
//         }

//         console.log(`Found ${expiredClients.length} expired clients`);

//         let updatedCount = 0;
//         let autoRenewedCount = 0;
//         const autoRenewedClients = [];

//         // Process each expired client
//         for (const client of expiredClients) {
//             // Check if auto-renew is enabled
//             if (client.autoRenew) {
//                 // Auto-renew for 30 days
//                 const previousExpiry = client.expiryDate;
//                 const newExpiry = new Date(previousExpiry);
//                 newExpiry.setDate(newExpiry.getDate() + 30);

//                 // Add to renewal history
//                 client.renewalHistory.push({
//                     previousExpiry,
//                     newExpiry,
//                     daysAdded: 30,
//                     renewedBy: null, // System auto-renewal
//                     renewedAt: new Date(),
//                     isAutoRenew: true
//                 });

//                 // Update client
//                 client.expiryDate = newExpiry;
//                 client.duration += 30;
//                 client.status = 'active';

//                 await client.save({ session });

//                 autoRenewedCount++;
//                 autoRenewedClients.push({
//                     id: client._id,
//                     name: client.customerName,
//                     email: client.email,
//                     previousExpiry,
//                     newExpiry
//                 });

//                 console.log(`Auto-renewed client: ${client.email} - New expiry: ${newExpiry}`);
//             } else {
//                 // Mark as expired
//                 client.status = 'expired';
//                 await client.save({ session });
//                 updatedCount++;

//                 // Deactivate associated auth user if exists
//                 if (client.authUserId) {
//                     await Auth.findByIdAndUpdate(
//                         client.authUserId,
//                         {
//                             status: 'inactive',
//                             token: null,
//                             refreshToken: null
//                         },
//                         { session }
//                     );
//                 }

//                 console.log(`Marked client as expired: ${client.email}`);
//             }
//         }

//         await session.commitTransaction();
//         session.endSession();

//         // Log the results
//         const result = {
//             processed: expiredClients.length,
//             updated: updatedCount,
//             autoRenewed: autoRenewedCount,
//             autoRenewedClients,
//             timestamp: new Date(),
//             message: `Processed ${expiredClients.length} expired clients: ${updatedCount} marked expired, ${autoRenewedCount} auto-renewed`
//         };
//         return result;

//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         throw new AppError(`Failed to process expired clients: ${error.message}`, 500);
//     }
// };

