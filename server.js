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
const PORT = Number(process.env.PORT) || 3000;

const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "railway_reservation",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
};

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PAYMENT_KEY) {
    throw new Error("SESSION_SECRET and ADMIN_PAYMENT_KEY must be set in .env");
}

const db = mysql.createPool(dbConfig);

const sessionStore = new MySQLStore({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
});

app.disable("x-powered-by");

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: null
        }
    }
}));

app.use(express.json({ limit: "30kb" }));

app.use(session({
    name: "trackmate_session",
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 4 * 60 * 60 * 1000
    }
}));

const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10
});

const registerLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10
});

const preferences = [
    "Upper Berth",
    "Middle Berth",
    "Lower Berth",
    "Side Upper Berth",
    "Side Lower Berth"
];

const paymentMethods = ["UPI", "Card", "Net Banking"];
const farePerPassenger = 500;

const wrap = fn => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const normalizeEmail = email =>
    String(email || "").trim().toLowerCase();

const validEmail = email =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// FIXED DATE VALIDATION
// Avoids timezone conversion changing the selected date.
function validDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
        return false;
    }

    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function loggedIn(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    next();
}

/* =====================================================
   REGISTER
===================================================== */

app.post("/api/register", registerLimit, wrap(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
            error: "Name must contain 2–100 characters."
        });
    }

    if (!validEmail(email) || email.length > 255) {
        return res.status(400).json({
            error: "Enter a valid email address."
        });
    }

    if (
        typeof password !== "string" ||
        password.length < 15 ||
        password.length > 128
    ) {
        return res.status(400).json({
            error: "Password must be 15–128 characters."
        });
    }

    const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id
    });

    try {
        const [result] = await db.execute(
            `INSERT INTO users (name, email, password_hash)
             VALUES (?, ?, ?)`,
            [name, email, passwordHash]
        );

        await new Promise((resolve, reject) => {
            req.session.regenerate(error => {
                if (error) reject(error);
                else resolve();
            });
        });

        req.session.userId = result.insertId;

        res.status(201).json({ success: true });

    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        throw error;
    }
}));

/* =====================================================
   LOGIN
===================================================== */

app.post("/api/login", loginLimit, wrap(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!validEmail(email) || typeof password !== "string") {
        return res.status(401).json({
            error: "Invalid email or password."
        });
    }

    const [users] = await db.execute(
        `SELECT user_id, password_hash
         FROM users
         WHERE email = ?`,
        [email]
    );

    if (
        !users.length ||
        !(await argon2.verify(users[0].password_hash, password))
    ) {
        return res.status(401).json({
            error: "Invalid email or password."
        });
    }

    await new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) reject(error);
            else resolve();
        });
    });

    req.session.userId = users[0].user_id;

    res.json({ success: true });
}));

/* =====================================================
   CURRENT USER
===================================================== */

app.get("/api/me", loggedIn, wrap(async (req, res) => {
    const [users] = await db.execute(
        `SELECT user_id, name, email
         FROM users
         WHERE user_id = ?`,
        [req.session.userId]
    );

    if (!users.length) {
        return res.status(401).json({
            error: "User account not found."
        });
    }

    res.json({
        authenticated: true,
        user: users[0]
    });
}));

/* =====================================================
   LOGOUT
===================================================== */

app.post("/api/logout", (req, res) => {
    req.session.destroy(error => {
        if (error) {
            return res.status(500).json({
                error: "Logout failed."
            });
        }

        res.clearCookie("trackmate_session");
        res.json({ success: true });
    });
});

/* =====================================================
   STATIONS
===================================================== */

app.get("/api/stations", wrap(async (req, res) => {
    const [stations] = await db.execute(
        `SELECT station_id, station_name
         FROM stations
         ORDER BY station_name`
    );

    res.json({ stations });
}));

/* =====================================================
   SEARCH TRAINS
   Database column: station_order
===================================================== */

app.get("/api/trains", wrap(async (req, res) => {
    const source = String(req.query.source || "").trim();
    const destination = String(req.query.destination || "").trim();
    const date = String(req.query.date || "");

    if (
        !source ||
        !destination ||
        source.toLowerCase() === destination.toLowerCase() ||
        !validDate(date)
    ) {
        return res.status(400).json({
            error: "Select two different stations and a valid date."
        });
    }

    const [trains] = await db.execute(`
        SELECT
            t.train_id,
            t.train_number,
            t.train_name,
            t.total_seats,
            GREATEST(
                0,
                t.total_seats - COALESCE((
                    SELECT SUM(b.passenger_count)
                    FROM bookings b
                    WHERE b.train_id = t.train_id
                    AND b.journey_date = ?
                    AND b.status IN ('CONFIRMED', 'PENDING_PAYMENT')
                ), 0)
            ) AS available_seats
        FROM trains t
        JOIN train_stations a ON a.train_id = t.train_id
        JOIN stations sa ON sa.station_id = a.station_id
        JOIN train_stations z ON z.train_id = t.train_id
        JOIN stations sz ON sz.station_id = z.station_id
        WHERE sa.station_name = ?
        AND sz.station_name = ?
        AND a.station_order < z.station_order
        ORDER BY t.train_number
    `, [date, source, destination]);

    res.json({ trains });
}));

/* =====================================================
   COACH POSITIONS
===================================================== */

app.get("/api/trains/:id/coaches", wrap(async (req, res) => {
    const trainId = Number(req.params.id);

    if (!Number.isInteger(trainId) || trainId < 1) {
        return res.status(400).json({
            error: "Invalid train."
        });
    }

    const [coaches] = await db.execute(`
        SELECT
            t.train_number,
            t.train_name,
            c.coach_name,
            c.position
        FROM trains t
        JOIN coaches c ON c.train_id = t.train_id
        WHERE t.train_id = ?
        ORDER BY c.position
    `, [trainId]);

    if (!coaches.length) {
        return res.status(404).json({
            error: "Train or coaches not found."
        });
    }

    res.json({
        train: {
            number: coaches[0].train_number,
            name: coaches[0].train_name
        },
        coaches
    });
}));

/* =====================================================
   CREATE BOOKING
===================================================== */

app.post("/api/bookings", loggedIn, wrap(async (req, res) => {
    const trainId = Number(req.body.trainId);
    const source = String(req.body.source || "").trim();
    const destination = String(req.body.destination || "").trim();
    const date = String(req.body.journeyDate || "");
    const people = req.body.passengers;
    const paymentMethod = req.body.paymentMethod;

    if (
        !Number.isInteger(trainId) ||
        trainId < 1 ||
        !source ||
        !destination ||
        !validDate(date)
    ) {
        return res.status(400).json({
            error: "Invalid train, route or journey date."
        });
    }

    if (!paymentMethods.includes(paymentMethod)) {
        return res.status(400).json({
            error: "Select a valid payment method."
        });
    }

    if (!Array.isArray(people) || people.length < 1 || people.length > 6) {
        return res.status(400).json({
            error: "Enter between 1 and 6 passengers."
        });
    }

    for (const person of people) {
        const name = String(person.name || "").trim();
        const age = Number(person.age);
        const gender = String(person.gender || "").trim();

        if (
            name.length < 2 ||
            name.length > 100 ||
            !Number.isInteger(age) ||
            age < 1 ||
            age > 120 ||
            !["Male", "Female", "Other"].includes(gender) ||
            !preferences.includes(person.preference)
        ) {
            return res.status(400).json({
                error: "Check every passenger's name, age, gender and berth preference."
            });
        }
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [trains] = await connection.execute(`
            SELECT t.*
            FROM trains t
            JOIN train_stations a ON a.train_id = t.train_id
            JOIN stations sa ON sa.station_id = a.station_id
            JOIN train_stations z ON z.train_id = t.train_id
            JOIN stations sz ON sz.station_id = z.station_id
            WHERE t.train_id = ?
            AND sa.station_name = ?
            AND sz.station_name = ?
            AND a.station_order < z.station_order
            FOR UPDATE
        `, [trainId, source, destination]);

        if (!trains.length) {
            await connection.rollback();

            return res.status(400).json({
                error: "This train does not serve the selected route."
            });
        }

        const [used] = await connection.execute(`
            SELECT COALESCE(SUM(passenger_count), 0) AS used
            FROM bookings
            WHERE train_id = ?
            AND journey_date = ?
            AND status IN ('CONFIRMED', 'PENDING_PAYMENT')
        `, [trainId, date]);

        const available =
            Number(trains[0].total_seats) - Number(used[0].used);

        if (people.length > available) {
            const [waiting] = await connection.execute(`
                INSERT INTO waiting_list (
                    user_id,
                    train_id,
                    source_station,
                    destination_station,
                    journey_date,
                    passenger_count,
                    passenger_json,
                    status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Waiting')
            `, [
                req.session.userId,
                trainId,
                source,
                destination,
                date,
                people.length,
                JSON.stringify(people)
            ]);

            await connection.commit();

            return res.status(202).json({
                waiting: true,
                waitingId: waiting.insertId,
                message: "No seats available. You have been added to the waiting list."
            });
        }

        const fare = people.length * farePerPassenger;

        const [booking] = await connection.execute(`
            INSERT INTO bookings (
                user_id,
                passenger_id,
                train_id,
                source_station,
                destination_station,
                journey_date,
                passenger_count,
                fare,
                payment_method,
                payment_status,
                status
            )
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'Pending', 'PENDING_PAYMENT')
        `, [
            req.session.userId,
            trainId,
            source,
            destination,
            date,
            people.length,
            fare,
            paymentMethod
        ]);

        for (const person of people) {
            await connection.execute(`
                INSERT INTO passengers (
                    name,
                    age,
                    gender,
                    booking_id,
                    seat_preference
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                String(person.name).trim(),
                Number(person.age),
                person.gender,
                booking.insertId,
                person.preference
            ]);
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            paymentRequired: true,
            booking: {
                pnr: booking.insertId,
                trainNumber: trains[0].train_number,
                trainName: trains[0].train_name,
                source,
                destination,
                journeyDate: date,
                passengers: people,
                passengerCount: people.length,
                paymentMethod,
                fare,
                total: fare,
                status: "PENDING_PAYMENT",
                paymentStatus: "Pending"
            }
        });

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

/* =====================================================
   SUBMIT UPI PAYMENT REFERENCE
   This does NOT automatically confirm payment.
===================================================== */

app.post(
    "/api/bookings/:pnr/payment-proof",
    loggedIn,
    wrap(async (req, res) => {
        const pnr = Number(req.params.pnr);
        const reference = String(
            req.body.paymentReference || ""
        ).trim();

        if (
            !Number.isInteger(pnr) ||
            pnr < 1 ||
            reference.length < 6 ||
            reference.length > 100
        ) {
            return res.status(400).json({
                error: "Enter a valid booking number and UPI reference."
            });
        }

        const [rows] = await db.execute(`
            SELECT booking_id, payment_method, payment_status, status
            FROM bookings
            WHERE booking_id = ?
            AND user_id = ?
        `, [pnr, req.session.userId]);

        if (!rows.length) {
            return res.status(404).json({
                error: "Booking not found."
            });
        }

        const booking = rows[0];

        if (booking.status !== "PENDING_PAYMENT") {
            return res.status(409).json({
                error: "This booking is not awaiting payment."
            });
        }

        if (booking.payment_method !== "UPI") {
            return res.status(400).json({
                error: "This booking is not using UPI."
            });
        }

        await db.execute(`
            UPDATE bookings
            SET payment_reference = ?,
                payment_status = 'Verification Pending'
            WHERE booking_id = ?
            AND user_id = ?
        `, [reference, pnr, req.session.userId]);

        res.json({
            success: true,
            message: "UPI reference received. Payment must be verified before ticket confirmation."
        });
    })
);

/* =====================================================
   ADMIN PAYMENT VERIFICATION
===================================================== */

app.post(
    "/api/admin/payments/:pnr/verify",
    wrap(async (req, res) => {
        const suppliedKey = String(
            req.headers["x-admin-payment-key"] || ""
        );

        if (suppliedKey !== process.env.ADMIN_PAYMENT_KEY) {
            return res.status(403).json({
                error: "Not authorized."
            });
        }

        const pnr = Number(req.params.pnr);
        const amountReceived = Number(req.body.amountReceived);

        if (
            !Number.isInteger(pnr) ||
            pnr < 1 ||
            !Number.isFinite(amountReceived) ||
            amountReceived <= 0
        ) {
            return res.status(400).json({
                error: "Invalid verification details."
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(`
                SELECT booking_id, fare, payment_status, status
                FROM bookings
                WHERE booking_id = ?
                FOR UPDATE
            `, [pnr]);

            if (!rows.length) {
                await connection.rollback();

                return res.status(404).json({
                    error: "Booking not found."
                });
            }

            const booking = rows[0];

            if (booking.status !== "PENDING_PAYMENT") {
                await connection.rollback();

                return res.status(409).json({
                    error: "Booking is not awaiting payment."
                });
            }

            if (amountReceived !== Number(booking.fare)) {
                await connection.rollback();

                return res.status(400).json({
                    error: `The full amount of ₹${booking.fare} must be received.`
                });
            }

            await connection.execute(`
                UPDATE bookings
                SET payment_status = 'Paid',
                    status = 'CONFIRMED'
                WHERE booking_id = ?
            `, [pnr]);

            await connection.commit();

            res.json({
                success: true,
                message: `Payment verified. PNR ${pnr} is confirmed.`
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    })
);

/* =====================================================
   MY BOOKINGS
===================================================== */

app.get("/api/bookings", loggedIn, wrap(async (req, res) => {
    const [bookings] = await db.execute(`
        SELECT
            b.booking_id AS pnr,
            b.train_id,
            t.train_number,
            t.train_name,
            b.source_station,
            b.destination_station,
            b.journey_date,
            b.passenger_count,
            b.fare,
            b.payment_method,
            b.payment_status,
            b.payment_reference,
            b.status,
            b.created_at
        FROM bookings b
        JOIN trains t ON t.train_id = b.train_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
    `, [req.session.userId]);

    for (const booking of bookings) {
        const [passengers] = await db.execute(`
            SELECT name, age, gender, seat_preference
            FROM passengers
            WHERE booking_id = ?
            ORDER BY passenger_id
        `, [booking.pnr]);

        booking.passengers = passengers;
    }

    res.json({ bookings });
}));

/* =====================================================
   CANCEL BOOKING
===================================================== */

app.post(
    "/api/bookings/:pnr/cancel",
    loggedIn,
    wrap(async (req, res) => {
        const pnr = Number(req.params.pnr);
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [bookings] = await connection.execute(`
                SELECT booking_id, status
                FROM bookings
                WHERE booking_id = ?
                AND user_id = ?
                FOR UPDATE
            `, [pnr, req.session.userId]);

            if (!bookings.length) {
                await connection.rollback();

                return res.status(404).json({
                    error: "Booking not found."
                });
            }

            if (
                !["CONFIRMED", "PENDING_PAYMENT"].includes(
                    bookings[0].status
                )
            ) {
                await connection.rollback();

                return res.status(409).json({
                    error: "This booking has already been cancelled."
                });
            }

            await connection.execute(`
                UPDATE bookings
                SET status = 'CANCELLED',
                    cancelled_at = CURRENT_TIMESTAMP
                WHERE booking_id = ?
            `, [pnr]);

            await connection.execute(`
                INSERT INTO cancellation_history (
                    booking_id,
                    user_id,
                    note
                )
                VALUES (?, ?, ?)
            `, [
                pnr,
                req.session.userId,
                "Cancelled by user"
            ]);

            await connection.commit();

            res.json({
                success: true,
                message: `PNR ${pnr} has been cancelled.`
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    })
);

/* =====================================================
   WAITING LIST
===================================================== */

app.get("/api/waiting-list", loggedIn, wrap(async (req, res) => {
    const [rows] = await db.execute(`
        SELECT
            w.*,
            t.train_number,
            t.train_name
        FROM waiting_list w
        JOIN trains t ON t.train_id = w.train_id
        WHERE w.user_id = ?
        ORDER BY w.created_at ASC
    `, [req.session.userId]);

    res.json({
        waitingList: rows.map(item => ({
            ...item,
            passengers: item.passenger_json
                ? (
                    typeof item.passenger_json === "string"
                        ? JSON.parse(item.passenger_json)
                        : item.passenger_json
                )
                : []
        }))
    });
}));

/* =====================================================
   CANCELLATION HISTORY
===================================================== */

app.get("/api/cancellations", loggedIn, wrap(async (req, res) => {
    const [rows] = await db.execute(`
        SELECT
            h.cancellation_id,
            h.booking_id AS pnr,
            h.cancelled_at,
            t.train_number,
            t.train_name
        FROM cancellation_history h
        JOIN bookings b ON b.booking_id = h.booking_id
        JOIN trains t ON t.train_id = b.train_id
        WHERE h.user_id = ?
        ORDER BY h.cancelled_at DESC
    `, [req.session.userId]);

    res.json({ cancellations: rows });
}));

/* =====================================================
   SERVE FRONTEND
===================================================== */

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use((error, req, res, next) => {
    console.error(error);

    if (!res.headersSent) {
        res.status(500).json({
            error: "Server error. Check the terminal."
        });
    }
});

/* =====================================================
   START SERVER
===================================================== */

(async () => {
    try {
        const connection = await db.getConnection();

        await connection.ping();

        connection.release();

        app.listen(PORT, () => {
            console.log("MySQL connected successfully.");
            console.log(
                `Trackmate running at http://localhost:${PORT}`
            );
        });

    } catch (error) {
        console.error("MySQL connection failed:", error.message);
        process.exit(1);
    }
})();
