const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// 1. Initialize and connect to the SQLite database
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to database.db');
        
        // Table: Tutor Registrations
        db.run(`CREATE TABLE IF NOT EXISTS tutor_registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_name TEXT,
            phone TEXT,
            children_count INTEGER,
            child_grades TEXT,
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Middleware to parse JSON request bodies
app.use(express.json());

// Serve static files from the root directory
app.use(express.static(__dirname));
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// 2. API Route: Save Tutor Registration (No login required)
app.post('/api/register-tutor', (req, res) => {
    const { parentName, phone, childrenCount, childGrades } = req.body;

    if (!parentName || !phone || !childrenCount || !childGrades) {
        return res.status(400).json({ message: "All registration fields are required." });
    }

    // Convert the array of grades to a JSON string so it stores easily in SQLite
    const gradesString = JSON.stringify(childGrades);

    db.run(
        `INSERT INTO tutor_registrations (parent_name, phone, children_count, child_grades) VALUES (?, ?, ?, ?)`,
        [parentName, phone, childrenCount, gradesString],
        function(err) {
            if (err) {
                console.error("Database save error:", err.message);
                return res.status(500).json({ message: "Could not save registration to database." });
            }
            res.json({ message: "Tutorial registration saved successfully!" });
        }
    );
});

// 3. API Route: Admin - Get All Tutor Registrations
app.get('/api/admin/registrations', (req, res) => {
    db.all(`SELECT * FROM tutor_registrations`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// 4. Explicit route for admin dashboard
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// 5. Fallback route serves index.html (your main page)
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 6. Start the Server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});