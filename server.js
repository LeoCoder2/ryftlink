const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- AUTOMATED FILE WORKSPACE CLEANUP FOR IPAD ---
const stuckFile = path.join(__dirname, 'index.js');
if (fs.existsSync(stuckFile)) {
    try {
        fs.unlinkSync(stuckFile);
        console.log('Successfully cleared stuck index.js from root!');
    } catch (err) {
        console.log('Error clearing root file: ', err);
    }
}

const stuckHtml = path.join(__dirname, 'index.html');
if (fs.existsSync(stuckHtml)) {
    try {
        fs.unlinkSync(stuckHtml);
        console.log('Successfully cleared stuck index.html from root!');
    } catch (err) {
        console.log('Error clearing root HTML file: ', err);
    }
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created empty uploads folder successfully!');
}

// Middleware for parsing JSON data
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Expose the uploads directory so uploaded files are accessible via links
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mock user database
const usersDB = [];

// Setup file upload handling storage configurations
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- AUTHENTICATION API ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        // Basic unique verification check
        if (usersDB.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered.' });
        }

        // Secure password hashing
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { email, username, password: hashedPassword };
        
        usersDB.push(newUser);
        
        // Simulating the email deployment step in terminal console logs
        console.log(`[Verification Link dispatched to ${email}]`);
        
        res.status(201).json({ message: 'Registration successful! Verification email simulated in console logs.' });
    } catch (err) {
        res.status(500).json({ error: 'Server registration error.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = usersDB.find(u => u.email === email);
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid login credentials.' });
        }
        
        res.json({ username: user.username, email: user.email });
    } catch (err) {
        res.status(500).json({ error: 'Server login error.' });
    }
});

// --- MEDIA ATTACHMENT UPLOAD ROUTE ---
app.post('/api/upload', upload.single('attachment'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, name: req.file.originalname });
});

// --- STATE MANAGEMENT CACHE MAPS ---
let activeClients = {}; 
let customGuilds = []; 

// --- REAL-TIME COMMUNICATION ENGINE ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('authenticate session', (userData) => {
        socket.username = userData.username;
        activeClients[userData.username] = {
            id: socket.id,
            username: userData.username,
            displayName: userData.displayName || userData.username,
            avatar: userData.avatar
        };
        broadcastUpdatedDirectoryMaps();
    });

    socket.on('update profile sync', (profileData) => {
        if (activeClients[socket.username]) {
            activeClients[socket.username].displayName = profileData.displayName;
            activeClients[socket.username].avatar = profileData.avatar;
            broadcastUpdatedDirectoryMaps();
        }
    });

    socket.on('create guild server', (guildData) => {
        const uniqueGuildId = 'guild-' + Date.now();
        const newServerInstance = {
            id: uniqueGuildId,
            name: guildData.name,
            channels: ['general', 'lounge', 'gaming']
        };
        customGuilds.push(newServerInstance);
        broadcastUpdatedDirectoryMaps();
    });

    socket.on('join active-room', (roomData) => {
        // Unsubscribe from previous rooms except user's private socket ID channel
        Array.from(socket.rooms).forEach(r => { if (r !== socket.id) socket.leave(r); });
        
        if (roomData.scope === 'home') {
            const dmRoomName = [socket.username, roomData.target].sort().join('_private_dm_');
            socket.join(dmRoomName);
        } else {
            const serverChannelRoom = `${roomData.scope}_room_chan_${roomData.target}`;
            socket.join(serverChannelRoom);
        }
    });

    socket.on('chat message', (data) => {
        const senderProfile = activeClients[socket.username] || { displayName: socket.username, avatar: '' };
        const outgoingMessagePayload = {
            user: socket.username,
            senderDisplayName: senderProfile.displayName,
            senderAvatar: senderProfile.avatar,
            text: data.text,
            fileUrl: data.fileUrl,
            fileName: data.fileName
        };

        if (data.scope === 'home') {
            const dmRoomName = [socket.username, data.target].sort().join('_private_dm_');
            io.to(dmRoomName).emit('chat message', outgoingMessagePayload);
        } else {
            const serverChannelRoom = `${data.scope}_room_chan_${data.target}`;
            io.to(serverChannelRoom).emit('chat message', outgoingMessagePayload);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.username) {
            delete activeClients[socket.username];
            broadcastUpdatedDirectoryMaps();
        }
    });

    function broadcastUpdatedDirectoryMaps() {
        io.emit('sync directories maps', {
            usersList: Object.values(activeClients),
            guildsList: customGuilds
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ryftlink engine active on port ${PORT}`));
