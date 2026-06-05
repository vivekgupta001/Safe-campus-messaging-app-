import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const API_URL = 'http://localhost:5000';
const SOCKET_URL = 'http://localhost:5000';

const AVATAR_OPTIONS = [
  { emoji: '🦊', label: 'Fox', color: '#f97316' },
  { emoji: '🐼', label: 'Panda', color: '#6b7280' },
  { emoji: '🦁', label: 'Lion', color: '#eab308' },
  { emoji: '🐨', label: 'Koala', color: '#9ca3af' },
  { emoji: '🦄', label: 'Unicorn', color: '#a855f7' },
  { emoji: '🦉', label: 'Owl', color: '#14b8a6' },
];

const INTEREST_OPTIONS = [
  'Music', 'Gaming', 'Coding', 'Sports', 'Anime', 
  'Movies', 'Reading', 'Hiking', 'Art', 'Drama', 
  'Tech', 'Science', 'Fitness', 'Cooking', 'Photography'
];

function App() {
  // Navigation / Auth State
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [view, setView] = useState('landing'); // 'landing', 'dashboard', 'matching', 'call', 'chat', 'admin'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login / Register Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦊');
  const [gender, setGender] = useState('male');
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [collegeIdFile, setCollegeIdFile] = useState(null);
  const [idPreview, setIdPreview] = useState(null);

  // Student Dashboard Stats State
  const [stats, setStats] = useState({
    conversationCount: 0,
    friendsCount: 0,
    pendingCount: 0,
    responseRate: 100,
    totalCallMinutes: 0,
    messagesCount: 0
  });

  // Matching / Voice Call State
  const [matchingStatus, setMatchingStatus] = useState('idle'); // 'idle', 'matching', 'matched'
  const [matchedPeer, setMatchedPeer] = useState(null);
  const [callRoomId, setCallRoomId] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [postCallModal, setPostCallModal] = useState(false); // Mutual consent modal
  const [callEndedData, setCallEndedData] = useState(null);

  // Direct Text Chat State
  const [friendsList, setFriendsList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeChatFriend, setActiveChatFriend] = useState(null); // Selected friend object
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [peerIsTyping, setPeerIsTyping] = useState(false);
  const [safetyAlert, setSafetyAlert] = useState('');

  // Safety Report State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Abusive Speech');
  const [reportDescription, setReportDescription] = useState('');
  const [reportedUserId, setReportedUserId] = useState('');

  // Admin Dashboard State
  const [adminStats, setAdminStats] = useState({
    totalUsers: 0,
    approvedUsers: 0,
    pendingApprovals: 0,
    bannedUsers: 0,
    totalCalls: 0,
    activeChats: 0,
    flaggedMessagesCount: 0,
    reportsCount: 0,
    pendingReportsCount: 0
  });
  const [pendingApprovalsList, setPendingApprovalsList] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  const [selectedIdDocUrl, setSelectedIdDocUrl] = useState(null); // Lightbox preview

  // Socket & WebRTC Refs
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Initialize Auth status and fetch profile
  useEffect(() => {
    if (token) {
      fetchUserProfile();
    }
  }, [token]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      cleanupCall();
    };
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // ==========================================
  // 🔌 SOCKET & WebRTC VOIP LOGIC
  // ==========================================

  const initializeSocket = (userToken) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(SOCKET_URL, {
      auth: { token: userToken }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to SafeCampus socket server!');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      setErrorMsg(`Connection error: ${err.message}`);
    });

    // 🤝 Match Lobby Listeners
    socket.on('match-found', async ({ roomId, peer, initiator }) => {
      console.log('✨ Match Found!', roomId, peer, initiator);
      setMatchingStatus('matched');
      setMatchedPeer(peer);
      setCallRoomId(roomId);
      setView('call');
      setCallDuration(0);

      // Start Call Timer
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      // Initiate WebRTC Call
      await startWebRTCCall(roomId, initiator);
    });

    socket.on('matching-cancelled', () => {
      setMatchingStatus('idle');
      setView('dashboard');
      setErrorMsg('Matchmaking cancelled.');
    });

    socket.on('match-error', (msg) => {
      setMatchingStatus('idle');
      setView('dashboard');
      setErrorMsg(msg);
    });

    // 📞 WebRTC VoIP Relay Listeners
    socket.on('signal-offer', async ({ offer }) => {
      console.log('📞 Received RTCPeerConnection Offer...');
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit('signal-answer', { roomId: callRoomId, answer });
      } catch (err) {
        console.error('Error handling voice offer:', err);
      }
    });

    socket.on('signal-answer', async ({ answer }) => {
      console.log('📞 Received RTCPeerConnection Answer...');
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Error setting remote voice description:', err);
      }
    });

    socket.on('signal-ice', async ({ candidate }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding remote ICE voice candidate:', err);
      }
    });

    socket.on('call-ended', () => {
      console.log('📞 Call ended by remote peer');
      handleCallEndCleanup();
    });

    // 💬 Chat Room Listeners
    socket.on('receive-message', (msg) => {
      // Append if it belongs to currently active chat
      if (activeChatFriend && msg.chatRoomId === activeChatFriend.chatRoomId) {
        setChatMessages((prev) => [...prev, msg]);
      }
    });

    socket.on('typing', ({ senderId, isTyping }) => {
      if (activeChatFriend && activeChatFriend.friend._id === senderId) {
        setPeerIsTyping(isTyping);
      }
    });

    socket.on('safety-warning', ({ message }) => {
      setSafetyAlert(message);
      // Auto dismiss safety warning after 6 seconds
      setTimeout(() => setSafetyAlert(''), 6000);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected.');
    });
  };

  // Setup WebRTC Audio Connections
  const startWebRTCCall = async (roomId, isInitiator) => {
    try {
      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 2. Initialize Peer Connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Add local stream tracks to PC
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Relay ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('signal-ice', { roomId, candidate: event.candidate });
        }
      };

      // Handle remote audio stream
      pc.ontrack = (event) => {
        console.log('🔊 WebRTC Audio Track received from peer!');
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(e => console.log('Audio autoplay blocked or failed:', e));
        }
      };

      // 3. Negotiate SDP
      if (isInitiator) {
        console.log('📞 Initiating RTC offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('signal-offer', { roomId, offer });
      }
    } catch (err) {
      console.warn('⚠️ WebRTC permission denied or unavailable. Falling back to voice simulation mode.', err.message);
      // Fallback: We keep the screen active to support smooth simulated voice call behavior!
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
    }
    setIsMuted(!isMuted);
  };

  const endCall = () => {
    if (socketRef.current && callRoomId) {
      socketRef.current.emit('end-call', { roomId: callRoomId });
    }
    handleCallEndCleanup();
  };

  const handleCallEndCleanup = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    // Save call statistics context for post-call modal
    if (matchedPeer) {
      setCallEndedData({
        peer: matchedPeer,
        duration: callDuration
      });
      setPostCallModal(true);
    }

    cleanupCall();
    setView('dashboard');
    setMatchingStatus('idle');
    fetchUserProfile(); // Refresh dashboard stats
  };

  const cleanupCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setIsMuted(false);
  };

  // ==========================================
  // 🚪 API SERVICE CALLS
  // ==========================================

  const fetchUserProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/users/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setUser(data.user);
        initializeSocket(token);

        if (data.user.role === 'admin') {
          setView('admin');
          fetchAdminDashboard();
        } else {
          setView('dashboard');
          fetchUserStats();
        }
      } else {
        handleLogout();
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Error connecting to the SafeCampus database server.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching student stats:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setSuccessMsg('Logged in successfully!');
      } else {
        setErrorMsg(data.message || 'Login failed.');
      }
    } catch (err) {
      setErrorMsg('Server connection failure. Please check if backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password || !pseudonym || !gender || !collegeIdFile) {
      setErrorMsg('All registration fields are required, including your College Student ID card image.');
      setLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);
      formData.append('pseudonym', pseudonym);
      formData.append('avatar', selectedAvatar);
      formData.append('gender', gender);
      formData.append('interests', JSON.stringify(selectedInterests));
      formData.append('collegeId', collegeIdFile);

      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg(data.message);
        setIsLogin(true); // Toggle back to login
        setEmail('');
        setPassword('');
      } else {
        setErrorMsg(data.message || 'Registration failed.');
      }
    } catch (err) {
      setErrorMsg('Server error. Ensure the upload image size is within 5MB.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    setView('landing');
    cleanupCall();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  // Matching lobby controls
  const enterMatchingLobby = () => {
    if (!user || !user.isApproved) {
      setErrorMsg('Your profile is pending admin ID approval. Verification is usually completed in under 24 hours.');
      return;
    }
    setErrorMsg('');
    setView('matching');
    setMatchingStatus('matching');
    socketRef.current.emit('join-matching');
  };

  const leaveMatchingLobby = () => {
    socketRef.current.emit('leave-matching');
    setMatchingStatus('idle');
    setView('dashboard');
  };

  // Post-call connection flow
  const sendFriendRequest = async () => {
    if (!callEndedData) return;
    try {
      const res = await fetch(`${API_URL}/api/chat/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          recipientId: callEndedData.peer._id,
          callDuration: callEndedData.duration
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setPostCallModal(false);
        setCallEndedData(null);
      } else {
        setErrorMsg(data.message);
      }
    } catch (err) {
      setErrorMsg('Error sending request.');
    }
  };

  const fetchFriendsAndRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat/friends`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setFriendsList(data.friends);
        setPendingRequests(data.pendingRequests);
      }
    } catch (err) {
      console.error('Error fetching connections:', err);
    }
  };

  const respondToRequest = async (requestId, action) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/request/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchFriendsAndRequests();
      }
    } catch (err) {
      setErrorMsg('Error responding to connection invite.');
    }
  };

  // Direct chat room interaction
  const selectChatFriend = async (friendObj) => {
    setActiveChatFriend(friendObj);
    setChatMessages([]);
    setPeerIsTyping(false);
    setSafetyAlert('');

    // Join Socket Room
    socketRef.current.emit('join-chat', { chatRoomId: friendObj.chatRoomId });

    // Fetch History
    try {
      const res = await fetch(`${API_URL}/api/chat/history/${friendObj.chatRoomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(data.messages);
      }
    } catch (err) {
      setErrorMsg('Failed to load chat history.');
    }
  };

  const sendMessage = () => {
    if (!inputMessage.trim() || !activeChatFriend) return;

    // Send via socket
    socketRef.current.emit('send-message', {
      chatRoomId: activeChatFriend.chatRoomId,
      recipientId: activeChatFriend.friend._id,
      content: inputMessage
    });

    // Reset typing
    socketRef.current.emit('typing', { chatRoomId: activeChatFriend.chatRoomId, isTyping: false });

    setInputMessage('');
  };

  const handleTyping = (e) => {
    setInputMessage(e.target.value);

    if (!activeChatFriend) return;

    socketRef.current.emit('typing', { chatRoomId: activeChatFriend.chatRoomId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit('typing', { chatRoomId: activeChatFriend.chatRoomId, isTyping: false });
    }, 2000);
  };

  // Safety complaint filing
  const submitSafetyReport = async () => {
    if (!reportedUserId || !reportReason) return;
    try {
      const res = await fetch(`${API_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reportedUserId,
          reason: reportReason,
          description: reportDescription
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setShowReportModal(false);
        setPostCallModal(false);
        setReportDescription('');
      } else {
        setErrorMsg(data.message);
      }
    } catch (err) {
      setErrorMsg('Error filing safety complaint.');
    }
  };

  // ==========================================
  // 🛡️ ADMINISTRATOR EXCLUSIVE CONTROLS
  // ==========================================

  const fetchAdminDashboard = async () => {
    try {
      const authHeader = { Authorization: `Bearer ${token}` };

      // Stats
      const statsRes = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeader });
      const statsData = await statsRes.json();
      if (statsData.success) setAdminStats(statsData.stats);

      // Pending
      const pendingRes = await fetch(`${API_URL}/api/admin/pending`, { headers: authHeader });
      const pendingData = await pendingRes.json();
      if (pendingData.success) setPendingApprovalsList(pendingData.users);

      // Reports
      const reportsRes = await fetch(`${API_URL}/api/admin/reports`, { headers: authHeader });
      const reportsData = await reportsRes.json();
      if (reportsData.success) setReportsList(reportsData.reports);
    } catch (err) {
      console.error('Error fetching admin workspace data:', err);
    }
  };

  const handleApproveStudent = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/approve/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAdminDashboard();
      }
    } catch (err) {
      setErrorMsg('Failed to approve profile.');
    }
  };

  const handleRejectStudent = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/reject/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAdminDashboard();
      }
    } catch (err) {
      setErrorMsg('Failed to reject registration request.');
    }
  };

  const handleToggleUserBan = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/ban/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAdminDashboard();
      }
    } catch (err) {
      setErrorMsg('Failed to toggle ban criteria.');
    }
  };

  // Helper file preview setup
  const handleIdUploadChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCollegeIdFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setIdPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleInterest = (tag) => {
    if (selectedInterests.includes(tag)) {
      setSelectedInterests(selectedInterests.filter((x) => x !== tag));
    } else {
      setSelectedInterests([...selectedInterests, tag]);
    }
  };

  // Helper duration formatter
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="main-wrapper">
      {/* Invisible HTML VoIP Receiver Node */}
      <audio ref={remoteAudioRef} style={{ display: 'none' }} />

      {/* Global Alerts */}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000, 
          background: 'rgba(239, 68, 68, 0.95)', padding: '12px 24px', 
          borderRadius: '8px', border: '1px solid #f87171', color: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <strong>⚠️ Error:</strong> {errorMsg}
          <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: 'white', marginLeft: '16px', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 1000, 
          background: 'rgba(16, 185, 129, 0.95)', padding: '12px 24px', 
          borderRadius: '8px', border: '1px solid #34d399', color: 'white',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <strong>✅ Success:</strong> {successMsg}
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', color: 'white', marginLeft: '16px', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
        </div>
      )}

      {/* ==========================================
         LANDING & AUTHENTICATION SCREEN
         ========================================== */}
      {view === 'landing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
          <div className="glass-heavy animate-pulse-glow" style={{ width: '100%', maxWidth: isLogin ? '460px' : '650px', padding: '36px', transition: 'max-width 0.4s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SafeCampus</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Privacy-first, semi-anonymous chat & voice connections</p>
            </div>

            {isLogin ? (
              /* LOGIN */
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" placeholder="student@yourcollege.edu" className="input-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" placeholder="••••••••••••" className="input-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px' }} disabled={loading}>
                  {loading ? 'Entering SafeCampus...' : 'Verify & Enter'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Need verification?{' '}
                  <span onClick={() => { setIsLogin(false); setErrorMsg(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}>Create an Account</span>
                </div>
              </form>
            ) : (
              /* REGISTRATION */
              <form onSubmit={handleRegister}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <div className="form-group">
                      <label>College Email</label>
                      <input type="email" placeholder="student@yourcollege.edu" className="input-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input type="password" placeholder="Min 6 characters" className="input-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Pseudonym (Display Name)</label>
                      <input type="text" placeholder="e.g. HiddenFox99" className="input-control" value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Gender Identification</label>
                      <div className="gender-selector">
                        <div className={`gender-option ${gender === 'male' ? 'selected male' : ''}`} onClick={() => setGender('male')}>♂️ Male</div>
                        <div className={`gender-option ${gender === 'female' ? 'selected female' : ''}`} onClick={() => setGender('female')}>♀️ Female</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="form-group">
                      <label>Select Avatar Character</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        {AVATAR_OPTIONS.map((x) => (
                          <div
                            key={x.label}
                            onClick={() => setSelectedAvatar(x.emoji)}
                            style={{
                              fontSize: '1.6rem', padding: '10px', borderRadius: '10px',
                              border: selectedAvatar === x.emoji ? `2px solid ${x.color}` : '1px solid var(--border-glass)',
                              background: selectedAvatar === x.emoji ? `${x.color}15` : 'rgba(255,255,255,0.02)',
                              textAlign: 'center', cursor: 'pointer', transition: 'var(--transition-smooth)'
                            }}
                          >
                            {x.emoji}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Upload Student ID Card for verification</label>
                      <input type="file" accept="image/*" onChange={handleIdUploadChange} style={{ display: 'none' }} id="id-upload-input" />
                      <label htmlFor="id-upload-input" className="btn-secondary" style={{ display: 'block', textAlign: 'center', fontSize: '0.85rem', padding: '10px', cursor: 'pointer' }}>
                        {collegeIdFile ? '✓ ID Attached' : '📁 Choose Image File'}
                      </label>
                      {idPreview && (
                        <img src={idPreview} alt="ID preview" style={{ width: '100%', height: '80px', objectFit: 'contain', marginTop: '10px', borderRadius: '4px', border: '1px solid var(--border-glass)' }} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label>Interests / Matching Tags (Select multiple)</label>
                  <div className="interests-container" style={{ maxHeight: '100px', overflowY: 'auto', padding: '8px', border: '1px solid var(--border-glass)', borderRadius: '8px', background: 'rgba(0,0,0,0.1)' }}>
                    {INTEREST_OPTIONS.map((tag) => (
                      <div
                        key={tag}
                        className={`interest-tag ${selectedInterests.includes(tag) ? 'selected' : ''}`}
                        onClick={() => toggleInterest(tag)}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
                  {loading ? 'Uploading & Creating Profile...' : 'Submit Profile for Admin Verification'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Already registered?{' '}
                  <span onClick={() => { setIsLogin(true); setErrorMsg(''); }} style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: '600' }}>Log In Here</span>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ==========================================
         MAIN LAYOUT (SIDEBAR + CORE SCREENS)
         ========================================== */}
      {view !== 'landing' && user && (
        <>
          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <h2 style={{ fontSize: '1.4rem', fontWeight: '700', background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SafeCampus</h2>
            </div>
            <div className="sidebar-menu">
              {user.role !== 'admin' && (
                <>
                  <div className={`menu-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => { setView('dashboard'); fetchUserStats(); }}>
                    <span>📊</span> Profile Dashboard
                  </div>
                  <div className={`menu-item ${view === 'chat' ? 'active' : ''}`} onClick={() => { setView('chat'); fetchFriendsAndRequests(); setActiveChatFriend(null); }}>
                    <span>💬</span> Friends Chat
                    {stats.pendingCount > 0 && (
                      <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 'bold', marginLeft: 'auto' }}>
                        {stats.pendingCount}
                      </span>
                    )}
                  </div>
                </>
              )}
              {user.role === 'admin' && (
                <div className={`menu-item ${view === 'admin' ? 'active' : ''}`} onClick={() => { setView('admin'); fetchAdminDashboard(); }}>
                  <span>🛡️</span> Safety Console
                </div>
              )}
              <div className="menu-item" onClick={handleLogout} style={{ marginTop: 'auto', color: 'var(--danger)' }}>
                <span>🚪</span> Logout
              </div>
            </div>
            <div className="sidebar-user">
              <div style={{ fontSize: '1.8rem', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {user.avatar}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.pseudonym}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {user.role === 'admin' ? 'Administrator' : `Student (${user.gender})`}
                </span>
              </div>
            </div>
          </aside>

          {/* Main App Content Viewport */}
          <main className="app-content">
            
            {/* ==========================================
               STUDENT PROFILE DASHBOARD VIEW
               ========================================== */}
            {view === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="dashboard-title-row">
                  <h1>Welcome, {user.pseudonym}</h1>
                  <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Here is your privacy-secure interaction summary</p>
                </div>

                {/* Verification Notice for Students */}
                {!user.isApproved && (
                  <div className="glass animate-pulse-glow" style={{ padding: '20px', borderLeft: '4px solid var(--warning)', background: 'rgba(245,158,11,0.05)' }}>
                    <h3 style={{ color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span>⚠️</span> Profile Pending ID Verification
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      An administrator is reviewing your uploaded College Student ID card. Verification takes place within 24 hours. Voice matching and friend chats will unlock once verified.
                    </p>
                  </div>
                )}

                {/* Student Analytics Metrics Grid */}
                <div className="stats-grid">
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon">📞</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.conversationCount}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Call Matches</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon cyan">🤝</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.friendsCount}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unlocked Connections</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon emerald">⏳</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.totalCallMinutes}m</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total Voice Hours</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon rose">💬</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{stats.messagesCount}</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Messages Exchanged</p>
                    </div>
                  </div>
                </div>

                {/* SVG circular gauge metrics & Profile Tags */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px' }}>
                  <div className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <h3 style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>Mutual Response Rate</h3>
                    <div className="gauge-circle">
                      <svg className="gauge-svg">
                        <defs>
                          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--primary)" />
                            <stop offset="100%" stopColor="var(--secondary)" />
                          </linearGradient>
                        </defs>
                        <circle className="gauge-bg" cx="60" cy="60" r="50" />
                        <circle
                          className="gauge-fill"
                          cx="60" cy="60" r="50"
                          style={{ strokeDashoffset: 314.16 - (314.16 * stats.responseRate) / 100 }}
                        />
                      </svg>
                      <div className="gauge-text">{stats.responseRate}%</div>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '16px', maxWidth: '180px' }}>
                      Percent of received matching invites you consented to add.
                    </p>
                  </div>

                  <div className="glass" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '12px' }}>Your Selected Interests</h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      Matched peers share these interests to create organic discussions.
                    </p>
                    <div className="interests-container">
                      {user.interests && user.interests.length > 0 ? (
                        user.interests.map((x) => (
                          <div key={x} className="interest-tag selected">
                            {x}
                          </div>
                        ))
                      ) : (
                        <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>No interests added yet.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Matchmaking trigger */}
                {user.isApproved && (
                  <div className="glass animate-pulse-glow" style={{ padding: '36px', textAlign: 'center', background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 80%)' }}>
                    <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Ready to connect?</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
                      Click below to enter the matching lobby. SafeCampus automatically finds opposite-gender peers with overlapping interests for a privacy-first, secure voice chat.
                    </p>
                    <button onClick={enterMatchingLobby} className="btn-primary" style={{ padding: '16px 36px', fontSize: '1.1rem' }}>
                      🤝 Connect to Matching Lobby
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
               MATCHING RADAR LOBBY VIEW
               ========================================== */}
            {view === 'matching' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="glass-heavy" style={{ width: '100%', maxWidth: '550px', padding: '40px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>Safe Lobby Matching</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Searching for opposite-gender peers with overlapping interests...</p>

                  <div className="radar-stage" style={{ marginBottom: '24px' }}>
                    <div className="radar-circle">
                      <div className="radar-pulse"></div>
                      <div className="radar-pulse"></div>
                      <div className="radar-avatar flex-center" style={{ fontSize: '2.5rem', background: 'var(--bg-dark)' }}>
                        {user.avatar}
                      </div>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '16px 0 24px', fontStyle: 'italic' }}>
                    Wait time is typically under 15 seconds. High interest compatibility matched first, falling back to random pairing.
                  </p>

                  <button onClick={leaveMatchingLobby} className="btn-danger" style={{ width: '100%' }}>
                    🚪 Cancel Lobby Search
                  </button>
                </div>
              </div>
            )}

            {/* ==========================================
               VOICE CALLING INTERFACE VIEW
               ========================================== */}
            {view === 'call' && matchedPeer && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h2 style={{ fontSize: '2.2rem', marginBottom: '8px', color: 'var(--secondary)' }}>📞 Active Voice Connection</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '40px' }}>Call Duration: <strong style={{ color: 'white' }}>{formatTime(callDuration)}</strong></p>

                <div className="call-container">
                  {/* Local User */}
                  <div className="call-panel glass">
                    <div className="call-avatar pulse-active flex-center" style={{ fontSize: '4rem', background: 'var(--bg-dark)' }}>
                      {user.avatar}
                    </div>
                    <h3 style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>You (Anonymous)</h3>
                    <div style={{ color: 'var(--success)', marginTop: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>📡 MIC LIVE</div>
                  </div>

                  {/* Matched Peer */}
                  <div className="call-panel glass animate-pulse-glow">
                    <div className="call-avatar pulse-active flex-center" style={{ fontSize: '4rem', background: 'var(--bg-dark)' }}>
                      {matchedPeer.avatar}
                    </div>
                    <h3 style={{ fontSize: '1.25rem', color: 'white' }}>{matchedPeer.pseudonym}</h3>
                    <div className="wave-visualizer" style={{ marginTop: '16px' }}>
                      <div className="wave-bar"></div>
                      <div className="wave-bar"></div>
                      <div className="wave-bar"></div>
                      <div className="wave-bar"></div>
                      <div className="wave-bar"></div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginTop: '12px' }}>
                      {matchedPeer.interests && matchedPeer.interests.slice(0, 3).map((item) => (
                        <span key={item} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.72rem' }}>
                          # {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="call-controls">
                  <button onClick={toggleMute} className={`call-circle-btn mute ${isMuted ? 'active' : ''}`} title={isMuted ? 'Unmute microphone' : 'Mute microphone'}>
                    {isMuted ? '🔇' : '🎙️'}
                  </button>
                  <button onClick={endCall} className="call-circle-btn hangup" title="Hangup connection">
                    ❌
                  </button>
                </div>
              </div>
            )}

            {/* ==========================================
               DIRECT FRIEND TEXT CHAT ROOM VIEW
               ========================================== */}
            {view === 'chat' && (
              <div className="chat-window glass">
                
                {/* Chat Left Sidebar (Unlocked Friends List) */}
                <div className="chat-sidebar">
                  <div className="chat-sidebar-header">
                    <h3 style={{ fontSize: '1.15rem' }}>Direct Chats</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unlocked via Voice Match consent</p>
                  </div>

                  {/* Pending Incoming Friend Requests List */}
                  {pendingRequests.length > 0 && (
                    <div style={{ padding: '12px', borderBottom: '1px solid var(--border-glass)', background: 'rgba(139,92,246,0.05)' }}>
                      <h4 style={{ fontSize: '0.8rem', color: 'var(--accent)', marginBottom: '8px' }}>📥 Pending Consent ({pendingRequests.length})</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {pendingRequests.map((req) => (
                          <div key={req.friendshipId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{req.requester.avatar} {req.requester.pseudonym}</span>
                            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                              <button onClick={() => respondToRequest(req.friendshipId, 'accept')} style={{ border: 'none', background: 'var(--success)', borderRadius: '3px', color: 'white', padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>✓</button>
                              <button onClick={() => respondToRequest(req.friendshipId, 'reject')} style={{ border: 'none', background: 'var(--danger)', borderRadius: '3px', color: 'white', padding: '2px 6px', fontSize: '0.75rem', cursor: 'pointer' }}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="chat-friends-list">
                    {friendsList.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 12px', fontSize: '0.85rem' }}>
                        No unlocked chats yet. Go to matches first!
                      </div>
                    ) : (
                      friendsList.map((f) => {
                        const isSelected = activeChatFriend && activeChatFriend.chatRoomId === f.chatRoomId;
                        return (
                          <div key={f.chatRoomId} className={`friend-chat-card ${isSelected ? 'active' : ''}`} onClick={() => selectChatFriend(f)}>
                            <div style={{ fontSize: '1.6rem', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {f.friend.avatar}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ fontWeight: '600', fontSize: '0.92rem' }}>{f.friend.pseudonym}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voice call: {Math.round(f.callDuration)}s</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Chat Right Main Body (Conversations Window) */}
                <div className="chat-main">
                  {activeChatFriend ? (
                    <>
                      {/* Active Chat Header */}
                      <div className="chat-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ fontSize: '1.6rem' }}>{activeChatFriend.friend.avatar}</div>
                          <div>
                            <h3 style={{ fontSize: '1.05rem' }}>{activeChatFriend.friend.pseudonym}</h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>● Secure Connection Unlocked</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setReportedUserId(activeChatFriend.friend._id);
                            setReportReason('Harassment');
                            setReportDescription('');
                            setShowReportModal(true);
                          }}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', borderColor: 'var(--danger)', color: '#fca5a5' }}
                        >
                          🚫 Report & Block
                        </button>
                      </div>

                      {/* AI Toxicity Alert Banner */}
                      {safetyAlert && (
                        <div className="chat-warning" style={{ margin: '12px 24px 0' }}>
                          <span>🛡️ Safety Watchdog:</span> {safetyAlert}
                        </div>
                      )}

                      {/* Chat Messages Body Log */}
                      <div className="chat-body">
                        {chatMessages.map((msg) => {
                          const isSent = msg.sender === user._id;
                          return (
                            <div key={msg._id} className={`chat-bubble-container ${isSent ? 'sent' : 'received'}`}>
                              <div className="chat-bubble">
                                {msg.content}
                                {msg.isFlagged && (
                                  <div style={{ fontSize: '0.7rem', color: '#fcd34d', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '4px', paddingTop: '2px' }}>
                                    ⚠️ Censored: {msg.flagReason}
                                  </div>
                                )}
                              </div>
                              <span className="chat-timestamp">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          );
                        })}
                        {peerIsTyping && (
                          <div className="chat-bubble-container received">
                            <div className="chat-bubble" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0' }}>
                              {activeChatFriend.friend.pseudonym} is typing...
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* Chat Footer Input */}
                      <div className="chat-footer">
                        <div className="chat-input-row">
                          <input
                            type="text"
                            placeholder="Type a safe, respectful message..."
                            className="input-control"
                            value={inputMessage}
                            onChange={handleTyping}
                            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                          />
                          <button onClick={sendMessage} className="btn-primary" style={{ padding: '12px 24px' }}>
                            Send
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <span>💬</span>
                      <h3 style={{ marginTop: '12px', fontSize: '1.1rem' }}>No Chat Selected</h3>
                      <p style={{ fontSize: '0.85rem' }}>Choose an unlocked connection from the side sidebar list to start chat messaging.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==========================================
               🛡️ ADMINISTRATOR MODERATION SYSTEM VIEW
               ========================================== */}
            {view === 'admin' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div className="dashboard-title-row">
                  <h1>Campus Safety Console</h1>
                  <p style={{ color: 'var(--text-muted)' }}>Review incoming college ID registrations, safety logs and moderation actions</p>
                </div>

                {/* Live Site-wide Analytics Grid */}
                <div className="stats-grid">
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon">👥</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{adminStats.totalUsers}</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Total Students</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon cyan">✓</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{adminStats.approvedUsers}</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Approved Profiles</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon rose">⚖️</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{adminStats.pendingReportsCount}</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Pending Reports</p>
                    </div>
                  </div>
                  <div className="stat-card glass glow-card">
                    <div className="stat-icon emerald">🚫</div>
                    <div>
                      <h3 style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{adminStats.bannedUsers}</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Banned Profiles</p>
                    </div>
                  </div>
                </div>

                {/* College Student ID Card review approvals */}
                <div className="glass" style={{ padding: '24px' }}>
                  <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🗂️</span> Pending Student Verification Requests ({pendingApprovalsList.length})
                  </h2>

                  {pendingApprovalsList.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>No profiles currently waiting for verification review.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Pseudonym</th>
                            <th>Email Address</th>
                            <th>Gender</th>
                            <th>College Student ID Card</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingApprovalsList.map((st) => (
                            <tr key={st._id}>
                              <td style={{ fontWeight: 'bold' }}>{st.avatar} {st.pseudonym}</td>
                              <td>{st.email}</td>
                              <td style={{ textTransform: 'capitalize' }}>{st.gender}</td>
                              <td>
                                <img
                                  src={`${API_URL}${st.collegeIdUrl}`}
                                  alt="ID card file"
                                  className="table-img"
                                  onClick={() => setSelectedIdDocUrl(`${API_URL}${st.collegeIdUrl}`)}
                                  title="Click to zoom file"
                                />
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => handleApproveStudent(st._id)} className="btn-cyan" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Approve</button>
                                  <button onClick={() => handleRejectStudent(st._id)} className="btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Reject</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Safety Reports Log */}
                <div className="glass" style={{ padding: '24px' }}>
                  <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🛡️</span> Live Campus Abuse & Safety Reports ({reportsList.length})
                  </h2>

                  {reportsList.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>No safety complaints reported by students.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Reporter ID</th>
                            <th>Reported Student ID</th>
                            <th>Reason Type</th>
                            <th>Abuse Narrative</th>
                            <th>Submitted At</th>
                            <th>Moderation Controls</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportsList.map((rep) => (
                            <tr key={rep._id}>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rep.reporter}</td>
                              <td style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>{rep.reportedUser}</td>
                              <td>
                                <span className="safety-tag banned" style={{ textTransform: 'uppercase' }}>
                                  {rep.reason}
                                </span>
                              </td>
                              <td>{rep.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>None</span>}</td>
                              <td>{new Date(rep.createdAt).toLocaleString()}</td>
                              <td>
                                <button onClick={() => handleToggleUserBan(rep.reportedUser)} className="btn-danger" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                  ⚠️ Toggle Ban Status
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </>
      )}

      {/* ==========================================
         MUTUAL CONSENT & POST-CALL FRIEND MODAL
         ========================================== */}
      {postCallModal && callEndedData && (
        <div className="modal-backdrop">
          <div className="modal-content glass-heavy animate-pulse-glow" style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '12px' }}>Mutual Consent Request</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Your call with <strong style={{ color: 'white' }}>{callEndedData.peer.pseudonym}</strong> lasted{' '}
              <strong style={{ color: 'white' }}>{formatTime(callEndedData.duration)}</strong>. Would you like to exchange direct text connection details?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
              <button onClick={sendFriendRequest} className="btn-primary" style={{ width: '100%', padding: '14px' }}>
                🤝 Share Consent & Add Friend
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setReportedUserId(callEndedData.peer._id);
                    setReportReason('Inappropriate Conduct');
                    setReportDescription('');
                    setShowReportModal(true);
                  }}
                  className="btn-danger"
                  style={{ flex: 1, padding: '10px' }}
                >
                  🚫 Report Abusive Behavior
                </button>
                <button
                  onClick={() => {
                    setPostCallModal(false);
                    setCallEndedData(null);
                  }}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '10px' }}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
         SAFETY COMPLAINT SUBMISSION MODAL
         ========================================== */}
      {showReportModal && (
        <div className="modal-backdrop" style={{ zIndex: 200 }}>
          <div className="modal-content glass-heavy">
            <h2 style={{ fontSize: '1.6rem', color: 'var(--danger)', marginBottom: '8px' }}>File Safety Incident Report</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Reports trigger direct security review. Submitting automatically blocks matching pairing with this student.
            </p>

            <div className="form-group">
              <label>Reason Category</label>
              <select className="input-control" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                <option value="Abusive Speech">Abusive Speech / Profanity</option>
                <option value="Harassment">Targeted Harassment</option>
                <option value="Unsolicited Conduct">Inappropriate VoIP Audio</option>
                <option value="Deceptive Identity">Fake Profile / Identity Scam</option>
                <option value="Other Safety Issue">Other Safety Violation</option>
              </select>
            </div>

            <div className="form-group">
              <label>Provide Details (Optional)</label>
              <textarea
                placeholder="Briefly describe what happened..."
                className="input-control"
                rows="4"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={submitSafetyReport} className="btn-danger" style={{ flex: 1 }}>Submit Incident Report</button>
              <button onClick={() => setShowReportModal(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
         ZOOMABLE LIGHTBOX FOR STUDENT ID PREVIEW
         ========================================== */}
      {selectedIdDocUrl && (
        <div className="modal-backdrop" onClick={() => setSelectedIdDocUrl(null)} style={{ cursor: 'zoom-out' }}>
          <div style={{ maxWidth: '85%', maxHeight: '85%' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={selectedIdDocUrl}
              alt="Zoomed Student ID Card doc"
              style={{ width: '100%', height: 'auto', borderRadius: '12px', border: '2px solid white', boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }}
            />
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button onClick={() => setSelectedIdDocUrl(null)} className="btn-primary" style={{ padding: '8px 24px' }}>Close Preview</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
