
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

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is missing from .env");
}

const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "railway_reservation"
};

const db = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

const sessionStore = new MySQLStore({
    ...dbConfig,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 4 * 60 * 60 * 1000
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

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
});

const SEAT_PREFERENCES = [
    "Upper Berth",
    "Middle Berth",
    "Lower Berth",
    "Side Upper Berth",
    "Side Lower Berth"
];

const PAYMENT_METHODS = ["UPI", "Card", "Net Banking"];
const FARE_PER_PASSENGER = 500;
const MAX_PASSENGERS = 6;

const normalizeEmail = value =>
    String(value || "").trim().toLowerCase();

const isValidEmail = value =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const isValidDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
};

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({
            error: "Please log in first."
        });
    }

    next();
};

const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const destroySession = (req, res) => {
    req.session.destroy(error => {
        if (error) {
            return res.status(500).json({
                error: "Could not end the session."
            });
        }

        res.clearCookie("trackmate_session");
        res.json({ success: true });
    });
};

app.post("/api/register", registerLimiter, asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
            error: "Name must contain between 2 and 100 characters."
        });
    }

    if (!isValidEmail(email) || email.length > 255) {
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
            error: "Password must contain between 15 and 128 characters."
        });
    }

    const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id
    });

    try {
        const [result] = await db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );

        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({
                    error: "Account created. Please log in."
                });
            }

            req.session.userId = result.insertId;

            res.status(201).json({
                success: true,
                message: "Account created successfully."
            });
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        throw error;
    }
}));

app.post("/api/login", loginLimiter, asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!isValidEmail(email) || typeof password !== "string") {
        return res.status(401).json({
            error: "Invalid email or password."
        });
    }

    const [users] = await db.execute(
        "SELECT user_id, password_hash FROM users WHERE email = ?",
        [email]
    );

    if (
        users.length === 0 ||
        !(await argon2.verify(users[0].password_hash, password))
    ) {
        return res.status(401).json({
            error: "Invalid email or password."
        });
    }

    req.session.regenerate(error => {
        if (error) {
            return res.status(500).json({
                error: "Login failed. Please try again."
            });
        }

        req.session.userId = users[0].user_id;

        res.json({
            success: true,
            message: "Login successful."
        });
    });
}));

app.get("/api/me", requireLogin, asyncHandler(async (req, res) => {
    const [users] = await db.execute(
        "SELECT user_id, name, email FROM users WHERE user_id = ?",
        [req.session.userId]
    );

    if (users.length === 0) {
        return res.status(401).json({
            authenticated: false
        });
    }

    res.json({
        authenticated: true,
        user: users[0]
    });
}));

app.post("/api/logout", (req, res) => {
    destroySession(req, res);
});

app.get("/api/stations", asyncHandler(async (req, res) => {
    const [stations] = await db.execute(
        "SELECT station_id, station_name FROM stations ORDER BY station_name"
    );

    res.json({ stations });
}));

app.get("/api/trains", asyncHandler(async (req, res) => {
    const source = String(req.query.source || "").trim();
    const destination = String(req.query.destination || "").trim();
    const date = String(req.query.date || "");

    if (
        !source ||
        !destination ||
        source.toLowerCase() === destination.toLowerCase() ||
        !isValidDate(date)
    ) {
        return res.status(400).json({
            error: "Select two different stations and a valid journey date."
        });
    }

    const [trains] = await db.execute(`
        SELECT
            t.train_id,
            t.train_number,
            t.train_name,
            t.total_seats,
            t.total_seats - COALESCE(
                (
                    SELECT SUM(b.passenger_count)
                    FROM bookings b
                    WHERE b.train_id = t.train_id
                    AND b.journey_date = ?
                    AND b.status = 'CONFIRMED'
                ),
                0
            ) AS available_seats
        FROM trains t
        INNER JOIN train_stations start_stop
            ON start_stop.train_id = t.train_id
        INNER JOIN stations start_station
            ON start_station.station_id = start_stop.station_id
        INNER JOIN train_stations end_stop
            ON end_stop.train_id = t.train_id
        INNER JOIN stations end_station
            ON end_station.station_id = end_stop.station_id
        WHERE start_station.station_name = ?
        AND end_station.station_name = ?
        AND start_stop.station_order < end_stop.station_order
        ORDER BY t.train_number
    `, [date, source, destination]);

    res.json({ trains });
}));

app.get("/api/trains/:id/coaches", asyncHandler(async (req, res) => {
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
        INNER JOIN coaches c ON c.train_id = t.train_id
        WHERE t.train_id = ?
        ORDER BY c.position
    `, [trainId]);

    if (coaches.length === 0) {
        return res.status(404).json({
            error: "No coaches found for this train."
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

app.post("/api/bookings", requireLogin, asyncHandler(async (req, res) => {
    const trainId = Number(req.body.trainId);
    const source = String(req.body.source || "").trim();
    const destination = String(req.body.destination || "").trim();
    const journeyDate = String(req.body.journeyDate || "");
    const passengers = req.body.passengers;
    const paymentMethod = req.body.paymentMethod;

    if (
        !Number.isInteger(trainId) ||
        trainId < 1 ||
        !source ||
        !destination ||
        source.toLowerCase() === destination.toLowerCase() ||
        !isValidDate(journeyDate)
    ) {
        return res.status(400).json({
            error: "Invalid train, route or journey date."
        });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({
            error: "Select a valid payment method."
        });
    }

    if (
        !Array.isArray(passengers) ||
        passengers.length < 1 ||
        passengers.length > MAX_PASSENGERS
    ) {
        return res.status(400).json({
            error: "Enter between 1 and 6 passengers."
        });
    }

    for (const passenger of passengers) {
        const name = String(passenger.name || "").trim();
        const age = Number(passenger.age);

        if (
            name.length < 2 ||
            name.length > 100 ||
            !Number.isInteger(age) ||
            age < 1 ||
            age > 120 ||
            !SEAT_PREFERENCES.includes(passenger.preference)
        ) {
            return res.status(400).json({
                error: "Check every passenger's name, age and seat preference."
            });
        }
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [trainRows] = await connection.execute(
            "SELECT train_id, train_number, train_name, total_seats FROM trains WHERE train_id = ? FOR UPDATE",
            [trainId]
        );

        if (trainRows.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                error: "Train not found."
            });
        }

        const train = trainRows[0];

        const [routeRows] = await connection.execute(`
            SELECT start_stop.station_order AS start_order,
                   end_stop.station_order AS end_order
            FROM train_stations start_stop
            INNER JOIN stations start_station
                ON start_station.station_id = start_stop.station_id
            INNER JOIN train_stations end_stop
                ON end_stop.train_id = start_stop.train_id
            INNER JOIN stations end_station
                ON end_station.station_id = end_stop.station_id
            WHERE start_stop.train_id = ?
            AND start_station.station_name = ?
            AND end_station.station_name = ?
            AND start_stop.station_order < end_stop.station_order
        `, [trainId, source, destination]);

        if (routeRows.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                error: "This train does not serve the selected route."
            });
        }

        const [usedRows] = await connection.execute(`
            SELECT COALESCE(SUM(passenger_count), 0) AS used_seats
            FROM bookings
            WHERE train_id = ?
            AND journey_date = ?
            AND status = 'CONFIRMED'
        `, [trainId, journeyDate]);

        const availableSeats =
            Number(train.total_seats) - Number(usedRows[0].used_seats);

        if (passengers.length > availableSeats) {
            const [waitingResult] = await connection.execute(`
                INSERT INTO waiting_list (
                    user_id,
                    train_id,
                    source_station,
                    destination_station,
                    journey_date,
                    passenger_count,
                    passenger_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                req.session.userId,
                trainId,
                source,
                destination,
                journeyDate,
                passengers.length,
                JSON.stringify(passengers)
            ]);

            await connection.commit();

            return res.status(202).json({
                waiting: true,
                waitingId: waitingResult.insertId,
                message: "There are not enough seats. You have been added to the waiting list."
            });
        }

        const fare = passengers.length * FARE_PER_PASSENGER;

        const [bookingResult] = await connection.execute(`
            INSERT INTO bookings (
                user_id,
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SIMULATED', 'CONFIRMED')
        `, [
            req.session.userId,
            trainId,
            source,
            destination,
            journeyDate,
            passengers.length,
            fare,
            paymentMethod
        ]);

        const pnr = bookingResult.insertId;

        for (const passenger of passengers) {
            await connection.execute(`
                INSERT INTO passengers (
                    booking_id,
                    name,
                    age,
                    gender,
                    seat_preference
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                pnr,
                String(passenger.name).trim(),
                Number(passenger.age),
                "Not specified",
                passenger.preference
            ]);
        }

        await connection.commit();

        res.status(201).json({
            booking: {
                pnr,
                trainNumber: train.train_number,
                trainName: train.train_name,
                source,
                destination,
                journeyDate,
                passengers,
                passengerCount: passengers.length,
                paymentMethod,
                fare,
                extraCharges: 0,
                total: fare,
                status: "CONFIRMED",
                paymentStatus: "SIMULATED"
            }
        });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

app.get("/api/bookings", requireLogin, asyncHandler(async (req, res) => {
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
            b.status,
            b.created_at
        FROM bookings b
        INNER JOIN trains t ON t.train_id = b.train_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
    `, [req.session.userId]);

    for (const booking of bookings) {
        const [passengers] = await db.execute(`
            SELECT name, age, seat_preference
            FROM passengers
            WHERE booking_id = ?
            ORDER BY passenger_id
        `, [booking.pnr]);

        booking.passengers = passengers;
    }

    res.json({ bookings });
}));

app.post("/api/bookings/:pnr/cancel", requireLogin, asyncHandler(async (req, res) => {
    const pnr = Number(req.params.pnr);

    if (!Number.isInteger(pnr) || pnr < 1) {
        return res.status(400).json({
            error: "Invalid PNR."
        });
    }

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

        if (bookings.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                error: "Booking not found."
            });
        }

        if (bookings[0].status !== "CONFIRMED") {
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
            INSERT INTO cancellation_history (booking_id, user_id, note)
            VALUES (?, ?, ?)
        `, [pnr, req.session.userId, "Cancelled by user"]);

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
}));

app.get("/api/waiting-list", requireLogin, asyncHandler(async (req, res) => {
    const [rows] = await db.execute(`
        SELECT
            w.waiting_id,
            w.train_id,
            w.source_station,
            w.destination_station,
            w.journey_date,
            w.passenger_count,
            w.passenger_json,
            w.status,
            w.created_at,
            t.train_number,
            t.train_name
        FROM waiting_list w
        INNER JOIN trains t ON t.train_id = w.train_id
        WHERE w.user_id = ?
        ORDER BY w.created_at ASC
    `, [req.session.userId]);

    const waitingList = rows.map(item => ({
        ...item,
        passengers: typeof item.passenger_json === "string"
            ? JSON.parse(item.passenger_json)
            : item.passenger_json
    }));

    res.json({ waitingList });
}));

app.get("/api/cancellations", requireLogin, asyncHandler(async (req, res) => {
    const [cancellations] = await db.execute(`
        SELECT
            h.cancellation_id,
            h.booking_id AS pnr,
            h.cancelled_at,
            t.train_number,
            t.train_name
        FROM cancellation_history h
        INNER JOIN bookings b ON b.booking_id = h.booking_id
        INNER JOIN trains t ON t.train_id = b.train_id
        WHERE h.user_id = ?
        ORDER BY h.cancelled_at DESC
    `, [req.session.userId]);

    res.json({ cancellations });
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, req, res, next) => {
    console.error("Server error:", error);

    if (!res.headersSent) {
        res.status(500).json({
            error: "A server error occurred. Check the terminal for details."
        });
    }
});

async function startServer() {
    try {
        const connection = await db.getConnection();
        await connection.ping();
        connection.release();

        app.listen(PORT, () => {
            console.log("MySQL connected successfully.");
            console.log(`Trackmate running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Could not start Trackmate:", error.message);
        process.exit(1);
    }
}

startServer();
