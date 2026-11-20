import { cleanupEndedIdentityDocuments } from '../models/Booking.js';

export function scheduleBookingIdentityCleanup() {
  const cleanup = async () => {
    try {
      await cleanupEndedIdentityDocuments();
    } catch (error) {
      console.error('Unable to clean up ended booking identity documents.', error.message);
    }
  };
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref();
  void cleanup();
}
