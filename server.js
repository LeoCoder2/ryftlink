const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// --- REAL-TIME COMMUNICATION ENGINE ---
io.on('connection', (socket) => {
    socket.on('chat message', (data) => {
        io.emit('chat message', {
            user: data.user,
            text: data.text || '',
            fileUrl: data.fileUrl || null,
            fileName: data.fileName || null
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ryftlink engine active on port ${PORT}`));
