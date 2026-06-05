const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const { joinQueue, leaveQueue } = require('./matchingService');
const { censorMessageContent, evaluateToxicityScore } = require('./moderationService');

// Map to track active user socket connections: userId -> socketId
const activeSockets = new Map();

const initializeSocket = (io) => {
  // Socket.io JWT Authentication Middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'safecampussupersecretjwtkey123');
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      if (user.isMutedOrBanned) {
        return next(new Error('Authentication error: Account suspended'));
      }

      socket.user = user;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    const pseudonym = socket.user.pseudonym;
    
    // Register socket connection
    activeSockets.set(userId, socket.id);
    socket.join(`user_${userId}`);
    
    // Update online status in database
    User.findByIdAndUpdate(userId, { isOnline: true }).catch(err => 
      console.error('Error setting user online:', err)
    );

    console.log(`🔌 SOCKET CONNECTED: "${pseudonym}" (Socket ID: ${socket.id})`);

    // ==========================================
    // 🤝 REAL-TIME MATCHING LOBBY EVENTS
    // ==========================================
    
    socket.on('join-matching', () => {
      // Ensure user profile is approved before joining matching
      if (!socket.user.isApproved) {
        socket.emit('match-error', 'Account validation required before matching.');
        return;
      }

      const userData = {
        _id: socket.user._id,
        pseudonym: socket.user.pseudonym,
        avatar: socket.user.avatar,
        gender: socket.user.gender,
        interests: socket.user.interests,
        socketId: socket.id
      };

      joinQueue(userData, io, (userA, userB, roomId) => {
        // Match found callback - notify both sockets and put them into the room
        const socketA = io.sockets.sockets.get(userA.socketId);
        const socketB = io.sockets.sockets.get(userB.socketId);

        if (socketA) socketA.join(roomId);
        if (socketB) socketB.join(roomId);

        // Notify User A about User B (hide DB email, role, etc. for extreme anonymity)
        io.to(userA.socketId).emit('match-found', {
          roomId,
          peer: {
            _id: userB._id,
            pseudonym: userB.pseudonym,
            avatar: userB.avatar,
            interests: userB.interests
          },
          initiator: true
        });

        // Notify User B about User A
        io.to(userB.socketId).emit('match-found', {
          roomId,
          peer: {
            _id: userA._id,
            pseudonym: userA.pseudonym,
            avatar: userA.avatar,
            interests: userA.interests
          },
          initiator: false
        });
      });
    });

    socket.on('leave-matching', () => {
      leaveQueue(socket.id);
      socket.emit('matching-cancelled');
    });

    // ==========================================
    // 📞 WebRTC VOICE SIGNALING RELAY EVENTS
    // ==========================================

    socket.on('signal-offer', ({ roomId, offer }) => {
      // Broadcast the Offer to the other user in the room
      socket.to(roomId).emit('signal-offer', { offer });
    });

    socket.on('signal-answer', ({ roomId, answer }) => {
      // Broadcast the Answer to the other user in the room
      socket.to(roomId).emit('signal-answer', { answer });
    });

    socket.on('signal-ice', ({ roomId, candidate }) => {
      // Relay ICE candidates to peer
      socket.to(roomId).emit('signal-ice', { candidate });
    });

    socket.on('end-call', ({ roomId }) => {
      console.log(`📞 CALL ENDED in room: ${roomId}`);
      // Notify other user in room to teardown WebRTC peer connections
      socket.to(roomId).emit('call-ended');
      socket.leave(roomId);
    });

    // ==========================================
    // 💬 MUTUAL FRIEND TEXT CHAT EVENTS
    // ==========================================

    socket.on('join-chat', ({ chatRoomId }) => {
      socket.join(chatRoomId);
      console.log(`💬 CHAT ROOM JOINED: User "${pseudonym}" joined room ${chatRoomId}`);
    });

    socket.on('send-message', async ({ chatRoomId, recipientId, content }) => {
      try {
        if (!content || !chatRoomId || !recipientId) return;

        // 1. Moderate message content using Censor and AI toxicity simulator
        const moderation = censorMessageContent(content);
        const toxicity = await evaluateToxicityScore(moderation.censoredText);

        const isFlagged = moderation.isFlagged || toxicity.isToxic;
        let flagReason = null;
        if (moderation.isFlagged) flagReason = `Offensive keywords: ${moderation.matches.join(', ')}`;
        else if (toxicity.isToxic) flagReason = `AI high toxicity assessment (${Math.round(toxicity.score * 100)}% confidence)`;

        // 2. Persist message to database
        const messageDoc = await Message.create({
          chatRoomId,
          sender: userId,
          recipient: recipientId,
          content: moderation.censoredText,
          isFlagged,
          flagReason
        });

        // 3. Broadcast message to room including flagged indicators so the client knows
        io.to(chatRoomId).emit('receive-message', {
          _id: messageDoc._id,
          chatRoomId,
          sender: userId,
          recipient: recipientId,
          content: moderation.censoredText,
          isFlagged,
          flagReason,
          createdAt: messageDoc.createdAt
        });

        // If highly toxic, push alert warning event directly to the recipient to support emotional safety
        if (toxicity.isToxic) {
          socket.to(chatRoomId).emit('safety-warning', {
            message: 'A message was filtered due to potential toxic or abusive speech. SafeCampus promotes kind communication!'
          });
        }
      } catch (err) {
        console.error('Error processing chat message:', err);
      }
    });

    socket.on('typing', ({ chatRoomId, isTyping }) => {
      // Notify other room members of user's typing activity
      socket.to(chatRoomId).emit('typing', { senderId: userId, isTyping });
    });

    // ==========================================
    // 🚪 SOCKET DISCONNECTION HANDLERS
    // ==========================================

    socket.on('disconnect', () => {
      console.log(`🔌 SOCKET DISCONNECTED: "${pseudonym}" (Socket ID: ${socket.id})`);
      
      // Cleanup matching queue if present
      leaveQueue(socket.id);
      
      // Remove socket reference
      activeSockets.delete(userId);

      // Set user status offline
      User.findByIdAndUpdate(userId, { isOnline: false }).catch(err => 
        console.error('Error setting user offline on disconnect:', err)
      );
    });
  });
};

module.exports = { initializeSocket, activeSockets };
