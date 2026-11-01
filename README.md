# Trackmate : Train Ticket Booking System

## Project Overview

Trackmate is a web-based train ticket booking project developed as part of our college Project-Based Learning (PBL) work.

### Current Features

- User registration and login
- Password hashing using Argon2id
- Session-based authentication
- MySQL database integration
- Passenger details and seat-preference submission
- Ticket details displayed after successful submission

**Current scope:** Authentication and database-backed ticket submission. Train search, seat allocation, and payment functionality are not yet implemented.

## Technology Stack

- HTML, CSS and JavaScript
- Node.js, script.js and server.js
- MySQL
- Argon2
- express
- Helmet

## Prerequisites

Install Node.js, MySQL Server, MySQL Workbench, and Git.

## Setup Instructions

1. Clone this repository.
2. Open MySQL Workbench and import `database/railway_reservation.sql`.
3. Open a terminal in the `website` directory.
4. Install the dependencies:

   `npm install`

5. Copy `.env.example` to `.env`.
6. Update `.env` with your local MySQL credentials and a unique session secret.
7. Start the server:

   `node server.js`

8. Open `http://localhost:3000` in your browser.

## Database

The `railway_reservation` database contains tables for users, trains, stations, passengers, bookings, and tickets.

## Security Notes

- Do not commit `.env` or real credentials.
- Passwords are stored as hashes, not plaintext.
- Each developer configures their own local environment.
