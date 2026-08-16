const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt'); // Added bcrypt import

const app = express();
const PORT = 3000;

// 1. Initialize and connect to the SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to database.db');
        
        // Table: Users
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT
        )`);

        // Table: Tutor Registrations (Linked to users table by email)
        db.run(`CREATE TABLE IF NOT EXISTS tutor_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            parent_name TEXT,
            phone TEXT,
            children_count INTEGER,
            child_grades TEXT
        )`);
    }
});

// Middleware to parse JSON request bodies
app.use(express.json());

// 2. Set up Sessions
app.use(session({
    secret: 'atu-tutorial-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // Keeps session active for 24 hours
}));

// Tell Express to serve static files from the 'public' folder
// Serve static files from the root directory so it finds index.html, atu.html, etc.
app.use(express.static(__dirname));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// 3. API Route: User Signup (Updated to hash password securely)
app.post('/api/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    try {
        // Hash the password securely with 10 salt rounds
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(`INSERT INTO users (email, password) VALUES (?, ?)`, [email, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ message: "Email already registered" });
                }
                return res.status(500).json({ message: "Database error occurred" });
            }
            
            req.session.userId = this.lastID;
            req.session.email = email;
            res.json({ message: "Registration successful", loggedIn: true, email });
        });
    } catch (error) {
        res.status(500).json({ message: "Server error during registration" });
    }
});

// 4. API Route: User Login (Updated to verify the hashed password)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    // Only query by email first
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, row) => {
        if (err) {
            return res.status(500).json({ message: "Database error occurred" });
        }
        if (!row) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        try {
            // Compare the entered password against the hashed password stored in the database
            const isMatch = await bcrypt.compare(password, row.password);
            
            if (!isMatch) {
                return res.status(401).json({ message: "Invalid email or password" });
            }

            // Set session details upon matching password
            req.session.userId = row.id;
            req.session.email = row.email;
            res.json({ message: "Login successful", loggedIn: true, email: row.email });
        } catch (error) {
            res.status(500).json({ message: "Server error during login" });
        }
    });
});

// 5. API Route: Save Tutor Registration (Linked to logged-in email)
app.post('/api/register-tutor', (req, res) => {
    const { parentName, phone, childrenCount, childGrades } = req.body;
    
    // Retrieve the user email from backend session or client payload fallback
    const userEmail = req.session.email || req.body.email;

    if (!userEmail) {
        return res.status(401).json({ message: "Unauthorized. Please log in first." });
    }

    if (!parentName || !phone || !childrenCount || !childGrades) {
        return res.status(400).json({ message: "All registration fields are required." });
    }

    // Convert the array of grades to a JSON string so it stores easily in SQLite
    const gradesString = JSON.stringify(childGrades);

    db.run(
        `INSERT INTO tutor_registrations (user_email, parent_name, phone, children_count, child_grades) VALUES (?, ?, ?, ?, ?)`,
        [userEmail, parentName, phone, childrenCount, gradesString],
        function(err) {
            if (err) {
                console.error("Database save error:", err.message);
                return res.status(500).json({ message: "Could not save registration to database." });
            }
            res.json({ message: "Tutorial registration saved successfully!" });
        }
    );
});

// 6. API Route: Session Check (Used by checkAuth and checkSession)
app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, email: req.session.email });
    } else {
        res.json({ loggedIn: false });
    }
});

// 7. API Route: Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: "Logout failed" });
        }
        res.clearCookie('connect.sid');
        res.json({ message: "Logged out successfully" });
    });
});

// Fallback route serves index.html from the root folder
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// Fallback route serves index.html from the root folder
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 📌 1. Place Admin Routes FIRST (so Express catches them before the fallback)
app.get('/api/admin/users', (req, res) => {
    db.all(`SELECT id, email FROM users`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.get('/api/admin/registrations', (req, res) => {
    db.all(`SELECT * FROM tutor_registrations`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 📌 2. Place the Fallback Route LAST (catches non-API requests)
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 📌 3. Start the Server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});


