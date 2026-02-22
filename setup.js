const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    multipleStatements: true
});

function runQuery(sql, callback) {
    pool.query(sql, (err, results) => {
        if (err) {
            console.log('Error:', err.message);
        } else {
            console.log('OK:', sql.substring(0, 50));
        }
        callback();
    });
}

runQuery('CREATE DATABASE IF NOT EXISTS clinivoice_v2', () => {
    runQuery('USE clinivoice_v2', () => {
        runQuery(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255),
            domain VARCHAR(50) NOT NULL DEFAULT 'medical',
            email VARCHAR(255),
            role VARCHAR(50) DEFAULT 'clinician',
            password_hash VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            runQuery(`CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                domain VARCHAR(50) NOT NULL DEFAULT 'medical',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`, () => {
                runQuery(`CREATE TABLE IF NOT EXISTS sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    patient_id INT,
                    domain VARCHAR(50) NOT NULL DEFAULT 'medical',
                    tooth_number VARCHAR(100),
                    transcription TEXT,
                    ai_notes TEXT,
                    status VARCHAR(50) DEFAULT 'recording',
                    duration INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )`, () => {
                    const bcrypt = require('bcryptjs');
                    const hash = bcrypt.hashSync('Admin@123', 10);
                    runQuery(`INSERT IGNORE INTO users (user_id, name, domain, role, password_hash) VALUES ('admin', 'Admin', 'medical', 'admin', '${hash}')`, () => {
                        console.log('Setup complete!');
                        pool.end();
                    });
                });
            });
        });
    });
});
