// segment queues by gender to satisfy "opposite gender only" constraint
const maleQueue = [];
const femaleQueue = [];

// Track active timers for matching timeouts
const timeouts = {};

/**
 * Adds a student to the matching queue and searches for a compatible opposite-gender student.
 * @param {Object} userData - { _id, pseudonym, avatar, gender, interests, socketId }
 * @param {Object} io - Socket.io server instance
 * @param {Function} onMatch - Callback triggered when a match is successfully made: (userA, userB, roomId)
 */
const joinQueue = (userData, io, onMatch) => {
  const { _id, socketId, gender, interests } = userData;

  // Prevent duplicate entries in the queues
  leaveQueue(socketId);

  const queueEntry = {
    ...userData,
    joinedAt: Date.now()
  };

  const targetQueue = gender === 'male' ? femaleQueue : maleQueue;
  const ownQueue = gender === 'male' ? maleQueue : femaleQueue;

  console.log(`🤝 MATCHING QUEUE: "${userData.pseudonym}" (${gender}) joined matching lobby. Interests: ${JSON.stringify(interests)}`);

  // 1. Try to find a match with shared interests
  let matchIndex = -1;
  let maxOverlap = 0;

  for (let i = 0; i < targetQueue.length; i++) {
    const peer = targetQueue[i];
    
    // Check intersection of interest arrays
    const overlap = interests.filter(x => peer.interests.includes(x)).length;
    
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      matchIndex = i;
    }
  }

  // 2. If a match with overlapping interests is found, connect them immediately!
  if (matchIndex !== -1) {
    const peerMatch = targetQueue.splice(matchIndex, 1)[0];
    
    // Clear fallback timeout for peer
    if (timeouts[peerMatch.socketId]) {
      clearTimeout(timeouts[peerMatch.socketId]);
      delete timeouts[peerMatch.socketId];
    }

    const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`✨ MATCH MADE (Interest-Based): "${userData.pseudonym}" and "${peerMatch.pseudonym}" (overlap of ${maxOverlap} interests)`);
    
    onMatch(queueEntry, peerMatch, roomId);
    return;
  }

  // 3. If no immediate interest match, push to own queue and wait
  ownQueue.push(queueEntry);

  // 4. Set fallback matching timeout (relaxed random match after 8 seconds)
  timeouts[socketId] = setTimeout(() => {
    // Check if user is still in the queue
    const indexInOwn = ownQueue.findIndex(item => item.socketId === socketId);
    if (indexInOwn !== -1 && targetQueue.length > 0) {
      // Pull longest waiting peer from opposite gender queue
      const peerMatch = targetQueue.shift();
      ownQueue.splice(indexInOwn, 1);
      
      // Clean timer
      delete timeouts[socketId];

      const roomId = `call_fallback_${Date.now()}`;
      console.log(`✨ MATCH MADE (Fallback Random): "${userData.pseudonym}" and "${peerMatch.pseudonym}"`);
      
      onMatch(queueEntry, peerMatch, roomId);
    } else {
      // Keep waiting
      console.log(`⌛ QUEUE TIMEOUT: No opposite-gender users available yet for "${userData.pseudonym}". Remaining in lobby.`);
    }
  }, 8000);
};

/**
 * Removes a student from the queues (e.g. on cancellation, navigation, or socket disconnect).
 */
const leaveQueue = (socketId) => {
  // Clear any existing fallback timers
  if (timeouts[socketId]) {
    clearTimeout(timeouts[socketId]);
    delete timeouts[socketId];
  }

  const mIndex = maleQueue.findIndex(item => item.socketId === socketId);
  if (mIndex !== -1) {
    console.log(`🚪 QUEUE LEAVE: Removed Male socket ${socketId} ("${maleQueue[mIndex].pseudonym}")`);
    maleQueue.splice(mIndex, 1);
    return;
  }

  const fIndex = femaleQueue.findIndex(item => item.socketId === socketId);
  if (fIndex !== -1) {
    console.log(`🚪 QUEUE LEAVE: Removed Female socket ${socketId} ("${femaleQueue[fIndex].pseudonym}")`);
    femaleQueue.splice(fIndex, 1);
    return;
  }
};

module.exports = {
  joinQueue,
  leaveQueue
};
