
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const argon2 = require("argon2");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

// Render runs behind a reverse proxy.
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

/* =========================================
   MYSQL DATABASE
========================================= */

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/* =========================================
   SECURITY AND MIDDLEWARE
========================================= */

app.disable("x-powered-by");

app.use(helmet());

app.use(
    express.json({
        limit: "10kb"
    })
);

/* =========================================
   SESSION CONFIGURATION
========================================= */

const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

app.use(
    session({
        name: "trackmate_session",

        secret: process.env.SESSION_SECRET,

        store: sessionStore,

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,

            secure: process.env.NODE_ENV === "production",

            sameSite: "lax",

            maxAge: 1000 * 60 * 60 * 4
        }
    })
);

/* =========================================
   LOGIN RATE LIMIT
========================================= */

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        error: "Too many login attempts. Please try again later."
    }
});

/* =========================================
   REGISTER RATE LIMIT
========================================= */

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        error: "Too many registration attempts. Please try again later."
    }
});

/* =========================================
   VALIDATION FUNCTIONS
========================================= */

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
}

function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 15 &&
        password.length <= 128
    );
}

/* =========================================
   REGISTER
========================================= */

app.post(
    "/api/register",
    registerLimiter,
    async (req, res) => {
        try {
            const name = String(req.body.name || "").trim();

            const email = normalizeEmail(req.body.email);

            const password = req.body.password;

            if (name.length < 2 || name.length > 100) {
                return res.status(400).json({
                    error: "Please enter a valid name."
                });
            }

            if (!validEmail(email)) {
                return res.status(400).json({
                    error: "Please enter a valid email."
                });
            }

            if (!validPassword(password)) {
                return res.status(400).json({
                    error: "Password must be between 15 and 128 characters."
                });
            }

            // Check whether the account already exists.
            const [existingUsers] = await db.execute(
                `
                SELECT user_id
                FROM users
                WHERE email = ?
                `,
                [email]
            );

            if (existingUsers.length > 0) {
                return res.status(409).json({
                    error: "Unable to create this account."
                });
            }

            // Hash password using Argon2id.
            const passwordHash = await argon2.hash(
                password,
                {
                    type: argon2.argon2id
                }
            );

            // Store the new account.
            const [result] = await db.execute(
                `
                INSERT INTO users
                (name, email, password_hash)
                VALUES (?, ?, ?)
                `,
                [name, email, passwordHash]
            );

            // Create a fresh login session.
            req.session.regenerate((error) => {
                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Account created but login failed."
                    });
                }

                req.session.userId = result.insertId;

                req.session.save((saveError) => {
                    if (saveError) {
                        console.error(saveError);

                        return res.status(500).json({
                            error: "Account created but login failed."
                        });
                    }

                    res.status(201).json({
                        success: true,
                        message: "Account created successfully."
                    });
                });
            });

        } catch (error) {
            console.error("Registration error:", error);

            res.status(500).json({
                error: "Something went wrong."
            });
        }
    }
);

/* =========================================
   LOGIN
========================================= */

app.post(
    "/api/login",
    loginLimiter,
    async (req, res) => {
        try {
            const email = normalizeEmail(req.body.email);

            const password = req.body.password;

            if (
                !validEmail(email) ||
                typeof password !== "string" ||
                password.length === 0
            ) {
                return res.status(401).json({
                    error: "Invalid email or password."
                });
            }

            // Find the account.
            const [users] = await db.execute(
                `
                SELECT
                    user_id,
                    email,
                    password_hash
                FROM users
                WHERE email = ?
                `,
                [email]
            );

            if (users.length === 0) {
                return res.status(401).json({
                    error: "Invalid email or password."
                });
            }

            const user = users[0];

            // Verify the Argon2id password hash.
            const passwordCorrect = await argon2.verify(
                user.password_hash,
                password
            );

            if (!passwordCorrect) {
                return res.status(401).json({
                    error: "Invalid email or password."
                });
            }

            // Regenerate session ID after authentication.
            req.session.regenerate((error) => {
                if (error) {
                    console.error(error);

                    return res.status(500).json({
                        error: "Login failed."
                    });
                }

                req.session.userId = user.user_id;

                req.session.save((saveError) => {
                    if (saveError) {
                        console.error(saveError);

                        return res.status(500).json({
                            error: "Login failed."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Login successful."
                    });
                });
            });

        } catch (error) {
            console.error("Login error:", error);

            res.status(500).json({
                error: "Something went wrong."
            });
        }
    }
);

/* =========================================
   CHECK LOGIN
========================================= */

app.get("/api/me", async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({
            authenticated: false
        });
    }

    try {
        const [users] = await db.execute(
            `
            SELECT
                user_id,
                name,
                email
            FROM users
            WHERE user_id = ?
            `,
            [req.session.userId]
        );

        if (users.length === 0) {
            req.session.destroy(() => {});

            return res.status(401).json({
                authenticated: false
            });
        }

        res.json({
            authenticated: true,
            user: users[0]
        });

    } catch (error) {
        console.error("Session check error:", error);

        res.status(500).json({
            error: "Unable to check login."
        });
    }
});

/* =========================================
   LOGOUT
========================================= */

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                error: "Logout failed."
            });
        }

        res.clearCookie("trackmate_session", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        res.json({
            success: true
        });
    });
});

/* =========================================
   TICKET BOOKING
========================================= */

app.post("/api/ticket", async (req, res) => {
    try {
        // User must be logged in.
        if (!req.session.userId) {
            return res.status(401).json({
                error: "Please login before booking a ticket."
            });
        }

        // Get data from the form.
        const name = String(req.body.name || "").trim();

        const age = Number(req.body.age);

        const email = normalizeEmail(req.body.email);

        const preference = String(req.body.preference || "").trim();

        // Validate passenger name.
        if (name.length < 2 || name.length > 100) {
            return res.status(400).json({
                error: "Please enter a valid name."
            });
        }

        // Validate age.
        if (
            !Number.isInteger(age) ||
            age < 1 ||
            age > 120
        ) {
            return res.status(400).json({
                error: "Please enter a valid age."
            });
        }

        // Validate email.
        if (!validEmail(email)) {
            return res.status(400).json({
                error: "Please enter a valid email."
            });
        }

        // Validate seat preference.
        const validPreferences = [
            "Upper Berth",
            "Middle Berth",
            "Lower Berth",
            "Side Upper Berth",
            "Side Lower Berth"
        ];

        if (!validPreferences.includes(preference)) {
            return res.status(400).json({
                error: "Please select a valid seat preference."
            });
        }

        // Save ticket in MySQL.
        const [result] = await db.execute(
            `
            INSERT INTO tickets
            (user_id, name, age, email, preference)
            VALUES (?, ?, ?, ?, ?)
            `,
            [
                req.session.userId,
                name,
                age,
                email,
                preference
            ]
        );

        // Return saved ticket.
        res.status(201).json({
            success: true,

            message: "Ticket booked successfully.",

            ticket: {
                ticket_id: result.insertId,
                name: name,
                age: age,
                email: email,
                preference: preference
            }
        });

    } catch (error) {
        console.error("Ticket booking error:", error);

        res.status(500).json({
            error: "Something went wrong while booking the ticket."
        });
    }
});

/* =========================================
   FRONTEND
========================================= */

// Serve CSS, JavaScript and other static files.
app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// Serve the homepage when the root URL is opened.
app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

/* =========================================
   START SERVER
========================================= */

app.listen(PORT, async () => {
    console.log(`Trackmate server running on port ${PORT}`);

    try {
        const connection = await db.getConnection();

        console.log("MySQL connected successfully.");

        connection.release();

    } catch (error) {
        console.error("MySQL connection failed:");
        console.error(error.message);
    }
});
