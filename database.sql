CREATE DATABASE railway_reservation;
USE railway_reservation;
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(100)
);
CREATE TABLE trains (
    train_id INT PRIMARY KEY AUTO_INCREMENT,
    train_number VARCHAR(20),
    train_name VARCHAR(100)
);
CREATE TABLE stations (
    station_id INT PRIMARY KEY AUTO_INCREMENT,
    station_name VARCHAR(100)
);
CREATE TABLE passengers (
    passenger_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    age INT,
    gender VARCHAR(20)
);
CREATE TABLE bookings (
    booking_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    passenger_id INT,
    train_id INT
);
SHOW DATABASES;
SHOW TABLES;
SELECT * FROM users;
SELECT * FROM trains;
SELECT * FROM stations;
SELECT * FROM passengers;
SELECT * FROM bookings;