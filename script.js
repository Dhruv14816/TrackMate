const $ = id => document.getElementById(id);

let selectedTrain = null;
let selectedJourney = null;
let currentBooking = null;

const FARE_PER_PASSENGER = 500;

const PREFERENCES = [
    "Upper Berth",
    "Middle Berth",
    "Lower Berth",
    "Side Upper Berth",
    "Side Lower Berth"
];


/* API */

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.headers || {}),
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        if (
            response.status === 401 &&
            !url.includes("/api/login") &&
            !url.includes("/api/register")
        ) {
            window.location.href = "/";
        }

        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}


/* MESSAGES */

function showMessage(element, message, type = "error") {
    if (!element) return;

    element.replaceChildren();

    const paragraph = document.createElement("p");
    paragraph.className = `booking-notice booking-${type}`;
    paragraph.textContent = message;

    element.appendChild(paragraph);
}


/* OPTIONS */

function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}


/* DATE */

function getLocalDate() {
    const now = new Date();
    const local = new Date(
        now.getTime() - now.getTimezoneOffset() * 60000
    );

    return local.toISOString().slice(0, 10);
}


/* INITIALIZE BOOKING PAGE */

async function initializeBookingPage() {
    if (!$("searchForm")) return;

    try {
        const session = await api("/api/me");

        $("welcomeUser").textContent =
            `Signed in as ${session.user.name}`;

        const data = await api("/api/stations");

        for (const station of data.stations) {
            addOption(
                $("source"),
                station.station_name,
                station.station_name
            );

            addOption(
                $("destination"),
                station.station_name,
                station.station_name
            );
        }

        const today = getLocalDate();

        $("journeyDate").min = today;
        $("journeyDate").value = today;

        await refreshAllData();

    } catch (error) {
        showMessage($("searchMessage"), error.message);
    }
}


/* CREATE INPUT */

function createInput(id, label, type, placeholder) {
    const wrapper = document.createElement("div");
    wrapper.className = "booking-field";

    const labelElement = document.createElement("label");
    labelElement.htmlFor = id;
    labelElement.textContent = label;

    const input = document.createElement("input");
    input.id = id;
    input.type = type;
    input.placeholder = placeholder;
    input.required = true;

    wrapper.append(labelElement, input);

    return { wrapper, input };
}


/* SEARCH TRAINS */

async function searchTrains(event) {
    event.preventDefault();

    $("trainResults").replaceChildren();
    $("searchMessage").replaceChildren();

    $("passengerPanel").classList.add("booking-hidden");
    $("paymentPanel").classList.add("booking-hidden");

    selectedTrain = null;
    selectedJourney = null;
    currentBooking = null;

    const source = $("source").value;
    const destination = $("destination").value;
    const date = $("journeyDate").value;

    try {
        const data = await api(
            `/api/trains?source=${encodeURIComponent(source)}` +
            `&destination=${encodeURIComponent(destination)}` +
            `&date=${encodeURIComponent(date)}`
        );

        $("coachTrain").replaceChildren();
        addOption($("coachTrain"), "", "Select a train");

        if (data.trains.length === 0) {
            showMessage(
                $("searchMessage"),
                "No trains found for this route."
            );
            return;
        }

        for (const train of data.trains) {
            const card = document.createElement("div");
            card.className = "train-card";

            const heading = document.createElement("h3");
            heading.textContent =
                `${train.train_number} · ${train.train_name}`;

            const details = document.createElement("p");
            details.className = "booking-muted";
            details.textContent =
                `${train.available_seats} seats available · ` +
                `${source} → ${destination} · ${date}`;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "booking-primary";
            button.textContent = "Select train";
            button.disabled = Number(train.available_seats) <= 0;

            button.addEventListener("click", () => {
                selectTrain(train, source, destination, date);
            });

            card.append(heading, details, button);
            $("trainResults").appendChild(card);

            addOption(
                $("coachTrain"),
                train.train_id,
                `${train.train_number} - ${train.train_name}`
            );
        }

    } catch (error) {
        showMessage($("searchMessage"), error.message);
    }
}


/* SELECT TRAIN */

function selectTrain(train, source, destination, date) {
    selectedTrain = train;

    selectedJourney = {
        source,
        destination,
        journeyDate: date
    };

    $("selectedTrainLabel").textContent =
        `${train.train_number} · ${train.train_name}`;

    $("passengerPanel").classList.remove("booking-hidden");
    $("paymentPanel").classList.add("booking-hidden");

    buildPassengerFields();

    $("passengerPanel").scrollIntoView({
        behavior: "smooth"
    });
}


/* BUILD PASSENGER FIELDS */

function buildPassengerFields() {
    const count = Number($("passengerCount").value);
    const container = $("passengerFields");

    container.replaceChildren();

    for (let i = 0; i < count; i++) {
        const passengerCard = document.createElement("div");
        passengerCard.className = "passenger-card";

        const heading = document.createElement("h3");
        heading.textContent = `Passenger ${i + 1}`;

        const grid = document.createElement("div");
        grid.className = "booking-passenger-grid";

        const name = createInput(
            `passengerName${i}`,
            "Full name",
            "text",
            "Enter passenger name"
        );

        const age = createInput(
            `passengerAge${i}`,
            "Age",
            "number",
            "Enter age"
        );

        age.input.min = "1";
        age.input.max = "120";

        const genderWrapper = document.createElement("div");
        genderWrapper.className = "booking-field";

        const genderLabel = document.createElement("label");
        genderLabel.htmlFor = `passengerGender${i}`;
        genderLabel.textContent = "Gender";

        const gender = document.createElement("select");
        gender.id = `passengerGender${i}`;
        gender.required = true;

        addOption(gender, "", "Select gender");
        addOption(gender, "Male", "Male");
        addOption(gender, "Female", "Female");
        addOption(gender, "Other", "Other");

        genderWrapper.append(genderLabel, gender);

        const preferenceWrapper = document.createElement("div");
        preferenceWrapper.className = "booking-field";

        const preferenceLabel = document.createElement("label");
        preferenceLabel.htmlFor = `passengerPreference${i}`;
        preferenceLabel.textContent = "Seat preference";

        const preference = document.createElement("select");
        preference.id = `passengerPreference${i}`;
        preference.required = true;

        addOption(preference, "", "Choose preference");

        for (const item of PREFERENCES) {
            addOption(preference, item, item);
        }

        preferenceWrapper.append(preferenceLabel, preference);

        grid.append(
            name.wrapper,
            age.wrapper,
            genderWrapper,
            preferenceWrapper
        );

        passengerCard.append(heading, grid);
        container.appendChild(passengerCard);
    }

    $("farePreview").textContent =
        `Total ₹${count * FARE_PER_PASSENGER} ` +
        `(₹500 per passenger, no extra charges)`;
}


/* COLLECT PASSENGERS */

function collectPassengers() {
    const count = Number($("passengerCount").value);
    const passengers = [];

    for (let i = 0; i < count; i++) {
        passengers.push({
            name: $(`passengerName${i}`).value.trim(),
            age: Number($(`passengerAge${i}`).value),
            gender: $(`passengerGender${i}`).value,
            preference: $(`passengerPreference${i}`).value
        });
    }

    return passengers;
}


/* CREATE BOOKING */

async function submitBooking(event) {
    event.preventDefault();

    if (!selectedTrain || !selectedJourney) {
        showMessage(
            $("bookingMessage"),
            "Select a train before booking."
        );
        return;
    }

    const count = Number($("passengerCount").value);
    const paymentMethod = $("paymentMethod").value;
    const passengers = collectPassengers();

    if (!["UPI", "Card", "Net Banking"].includes(paymentMethod)) {
        showMessage(
            $("bookingMessage"),
            "Select a payment method."
        );
        return;
    }

    for (const person of passengers) {
        if (
            person.name.length < 2 ||
            !Number.isInteger(person.age) ||
            person.age < 1 ||
            person.age > 120 ||
            !["Male", "Female", "Other"].includes(person.gender) ||
            !PREFERENCES.includes(person.preference)
        ) {
            showMessage(
                $("bookingMessage"),
                "Complete all passenger details correctly."
            );
            return;
        }
    }

    if (paymentMethod !== "UPI") {
        showMessage(
            $("bookingMessage"),
            "Card and Net Banking require a payment gateway. Please select UPI for QR payment."
        );
        return;
    }

    const total = count * FARE_PER_PASSENGER;

    const confirmed = window.confirm(
        `BOOKING SUMMARY\n\n` +
        `Train: ${selectedTrain.train_name}\n` +
        `Passengers: ${count}\n` +
        `Fare: ₹${total}\n` +
        `Extra charges: ₹0\n` +
        `Total: ₹${total}\n\n` +
        `Continue to payment?`
    );

    if (!confirmed) return;

    const button = $("bookingForm").querySelector(
        'button[type="submit"]'
    );

    button.disabled = true;

    try {
        const result = await api("/api/bookings", {
            method: "POST",
            body: JSON.stringify({
                trainId: selectedTrain.train_id,
                ...selectedJourney,
                passengers,
                paymentMethod
            })
        });

        if (result.waiting) {
            showMessage(
                $("bookingMessage"),
                `${result.message} Waiting-list reference: ${result.waitingId}`,
                "success"
            );

            $("passengerPanel").classList.add("booking-hidden");

            await refreshAllData();
            return;
        }

        currentBooking = result.booking;

        showPaymentPanel(result.booking);

        $("bookingMessage").replaceChildren();

        await refreshAllData();

    } catch (error) {
        showMessage($("bookingMessage"), error.message);
    } finally {
        button.disabled = false;
    }
}


/* PAYMENT PANEL */

function showPaymentPanel(booking) {
    currentBooking = booking;

    $("paymentPanel").classList.remove("booking-hidden");

    $("paymentTotal").textContent =
        `Total amount: ₹${booking.total}`;

    $("paymentPassengerCount").textContent =
        `${booking.passengerCount} passenger(s) · ` +
        `₹500 each · ₹0 extra charges`;

    $("paymentReference").value = "";
    $("paymentReference").disabled = false;

    $("submitPaymentReference").disabled = false;
    $("submitPaymentReference").textContent =
        "Submit payment reference";

    $("paymentMessage").replaceChildren();

    $("upiPayment").classList.remove("booking-hidden");
    $("gatewayMessage").classList.add("booking-hidden");

    $("paymentPanel").scrollIntoView({
        behavior: "smooth"
    });
}


/* SUBMIT UPI REFERENCE */

async function submitPaymentReference() {
    if (!currentBooking) {
        showMessage(
            $("paymentMessage"),
            "No booking selected."
        );
        return;
    }

    const reference = $("paymentReference").value.trim();

    if (reference.length < 6 || reference.length > 100) {
        showMessage(
            $("paymentMessage"),
            "Enter a valid UPI transaction reference."
        );
        return;
    }

    const button = $("submitPaymentReference");
    button.disabled = true;

    try {
        const result = await api(
            `/api/bookings/${currentBooking.pnr}/payment-proof`,
            {
                method: "POST",
                body: JSON.stringify({
                    paymentReference: reference
                })
            }
        );

        showMessage(
            $("paymentMessage"),
            result.message,
            "success"
        );

        $("paymentReference").disabled = true;
        button.textContent = "Reference submitted";

        await refreshAllData();

    } catch (error) {
        showMessage($("paymentMessage"), error.message);
        button.disabled = false;
    }
}


/* DISPLAY TICKET */

function displayTicket(booking) {
    const container = $("ticketDetails");
    container.replaceChildren();

    const details = [
        ["PNR", booking.pnr],
        ["Train", `${booking.train_number} - ${booking.train_name}`],
        ["From", booking.source_station],
        ["To", booking.destination_station],
        ["Journey date", booking.journey_date],
        ["Passengers", booking.passenger_count],
        ["Payment method", booking.payment_method],
        ["Fare", `₹${booking.fare}`],
        ["Extra charges", "₹0"],
        ["Total", `₹${booking.fare}`],
        ["Payment status", booking.payment_status],
        ["Booking status", booking.status]
    ];

    for (const [label, value] of details) {
        const row = document.createElement("div");
        row.className = "booking-detail";

        const key = document.createElement("strong");
        key.textContent = label;

        const content = document.createElement("span");
        content.textContent = value;

        row.append(key, content);
        container.appendChild(row);
    }

    const passengerHeading = document.createElement("h3");
    passengerHeading.textContent = "Passenger information";
    passengerHeading.style.marginTop = "18px";

    container.appendChild(passengerHeading);

    for (const person of booking.passengers || []) {
        const paragraph = document.createElement("p");
        paragraph.className = "booking-muted";

        paragraph.textContent =
            `${person.name} · Age ${person.age} · ` +
            `${person.gender} · ${person.seat_preference}`;

        container.appendChild(paragraph);
    }

    $("ticketPanel").classList.remove("booking-hidden");

    $("ticketPanel").scrollIntoView({
        behavior: "smooth"
    });
}


/* REFRESH */

async function refreshAllData() {
    await Promise.all([
        loadBookings(),
        loadWaitingList(),
        loadCancellations()
    ]);
}


/* LOAD BOOKINGS */

async function loadBookings() {
    const container = $("bookingsList");

    try {
        const data = await api("/api/bookings");

        container.replaceChildren();

        if (data.bookings.length === 0) {
            container.textContent = "You have no bookings yet.";
            return;
        }

        for (const booking of data.bookings) {
            const card = document.createElement("div");
            card.className = "booking-card";

            const heading = document.createElement("h3");
            heading.textContent =
                `PNR ${booking.pnr} · ` +
                `${booking.train_number} ${booking.train_name}`;

            const details = document.createElement("p");
            details.className = "booking-muted";

            details.textContent =
                `${booking.source_station} → ${booking.destination_station} · ` +
                `${booking.journey_date} · ` +
                `${booking.passenger_count} passenger(s) · ` +
                `₹${booking.fare} · ${booking.status} · ` +
                `Payment: ${booking.payment_status}`;

            card.append(heading, details);

            if (booking.passengers.length) {
                const passengerDetails = document.createElement("p");
                passengerDetails.className = "booking-muted";

                passengerDetails.textContent =
                    "Passengers: " +
                    booking.passengers.map(person =>
                        `${person.name} (${person.age}, ${person.gender})`
                    ).join(", ");

                card.appendChild(passengerDetails);
            }

            if (
                booking.status === "CONFIRMED" &&
                booking.payment_status === "Paid"
            ) {
                const viewButton = document.createElement("button");
                viewButton.type = "button";
                viewButton.className = "booking-secondary";
                viewButton.textContent = "View ticket";

                viewButton.addEventListener("click", () => {
                    displayTicket(booking);
                });

                card.appendChild(viewButton);
            }

            if (booking.status === "PENDING_PAYMENT") {
                const payButton = document.createElement("button");
                payButton.type = "button";
                payButton.className = "booking-primary";
                payButton.textContent = "Continue payment";

                payButton.addEventListener("click", () => {
                    showPaymentPanel({
                        pnr: booking.pnr,
                        total: Number(booking.fare),
                        passengerCount: booking.passenger_count
                    });

                    if (booking.payment_reference) {
                        $("paymentReference").value =
                            booking.payment_reference;

                        $("paymentReference").disabled = true;
                        $("submitPaymentReference").disabled = true;
                        $("submitPaymentReference").textContent =
                            "Reference submitted";
                    }
                });

                card.appendChild(payButton);
            }

            if (
                booking.status === "CONFIRMED" ||
                booking.status === "PENDING_PAYMENT"
            ) {
                const cancelButton = document.createElement("button");
                cancelButton.type = "button";
                cancelButton.className = "booking-danger";
                cancelButton.textContent = "Cancel booking";

                cancelButton.addEventListener("click", () => {
                    cancelBooking(booking.pnr);
                });

                card.appendChild(cancelButton);
            }

            container.appendChild(card);
        }

    } catch (error) {
        container.textContent = error.message;
    }
}


/* CANCEL BOOKING */

async function cancelBooking(pnr) {
    const confirmed = window.confirm(
        `Are you sure you want to cancel PNR ${pnr}?`
    );

    if (!confirmed) return;

    try {
        const result = await api(
            `/api/bookings/${pnr}/cancel`,
            { method: "POST" }
        );

        window.alert(result.message);

        await refreshAllData();

    } catch (error) {
        window.alert(error.message);
    }
}


/* WAITING LIST */

async function loadWaitingList() {
    const container = $("waitingListContent");

    try {
        const data = await api("/api/waiting-list");

        container.replaceChildren();

        if (!data.waitingList.length) {
            container.textContent = "Your waiting list is empty.";
            return;
        }

        for (const item of data.waitingList) {
            const card = document.createElement("div");
            card.className = "list-card";

            card.textContent =
                `WL ${item.waiting_id} · ` +
                `${item.train_number} ${item.train_name} · ` +
                `${item.source_station} → ${item.destination_station} · ` +
                `${item.journey_date} · ` +
                `${item.passenger_count} passenger(s) · ${item.status}`;

            container.appendChild(card);
        }

    } catch (error) {
        container.textContent = error.message;
    }
}


/* CANCELLATION HISTORY */

async function loadCancellations() {
    const container = $("cancellationsContent");

    try {
        const data = await api("/api/cancellations");

        container.replaceChildren();

        if (!data.cancellations.length) {
            container.textContent = "No cancellations yet.";
            return;
        }

        for (const item of data.cancellations) {
            const card = document.createElement("div");
            card.className = "list-card";

            card.textContent =
                `PNR ${item.pnr} · ` +
                `${item.train_number} ${item.train_name} · ` +
                `Cancelled: ${item.cancelled_at}`;

            container.appendChild(card);
        }

    } catch (error) {
        container.textContent = error.message;
    }
}


/* COACH POSITIONS */

async function showCoaches() {
    const trainId = $("coachTrain").value;

    if (!trainId) {
        showMessage($("coachResult"), "Select a train first.");
        return;
    }

    try {
        const data = await api(`/api/trains/${trainId}/coaches`);
        const container = $("coachResult");

        container.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent =
            `${data.train.number} · ${data.train.name}`;

        const arrangement = document.createElement("p");
        arrangement.textContent =
            "Engine → " +
            data.coaches.map(coach => coach.coach_name).join(" → ");

        container.append(heading, arrangement);

        for (const coach of data.coaches) {
            const paragraph = document.createElement("p");
            paragraph.textContent =
                `Position ${coach.position}: ${coach.coach_name}`;

            container.appendChild(paragraph);
        }

    } catch (error) {
        showMessage($("coachResult"), error.message);
    }
}


/* AUTHENTICATION */

function initializeAuthentication() {
    const password = $("password");
    const passwordToggle = $("passwordToggle");

    if (password && passwordToggle) {
        passwordToggle.addEventListener("click", () => {
            const showing = password.type === "password";

            password.type = showing ? "text" : "password";
            passwordToggle.textContent = showing ? "🙈" : "👁";

            passwordToggle.setAttribute(
                "aria-label",
                showing ? "Hide password" : "Show password"
            );
        });
    }

    if ($("loginForm")) {
        $("loginForm").addEventListener("submit", async event => {
            event.preventDefault();

            const message = $("loginMessage");

            message.textContent = "Signing in...";
            message.className = "login-message";

            try {
                await api("/api/login", {
                    method: "POST",
                    body: JSON.stringify({
                        email: $("email").value.trim(),
                        password: $("password").value
                    })
                });

                message.textContent = "Login successful!";
                message.className = "login-message success";

                window.location.href = "/booking.html";

            } catch (error) {
                message.textContent = error.message;
                message.className = "login-message error";
            }
        });
    }

    if ($("registerForm")) {
        $("registerForm").addEventListener("submit", async event => {
            event.preventDefault();

            const message = $("registerMessage");

            message.textContent = "Creating account...";
            message.className = "login-message";

            try {
                await api("/api/register", {
                    method: "POST",
                    body: JSON.stringify({
                        name: $("name").value.trim(),
                        email: $("email").value.trim(),
                        password: $("password").value
                    })
                });

                message.textContent = "Account created successfully!";
                message.className = "login-message success";

                window.location.href = "/booking.html";

            } catch (error) {
                message.textContent = error.message;
                message.className = "login-message error";
            }
        });
    }
}


/* PAGE CONTROLS */

function initializePageControls() {
    if ($("logoutButton")) {
        $("logoutButton").addEventListener("click", async () => {
            try {
                await api("/api/logout", { method: "POST" });
            } catch (error) {
                console.error(error);
            }

            window.location.href = "/";
        });
    }

    if ($("searchForm")) {
        $("searchForm").addEventListener("submit", searchTrains);
    }

    if ($("bookingForm")) {
        $("bookingForm").addEventListener("submit", submitBooking);
    }

    if ($("passengerCount")) {
        $("passengerCount").addEventListener(
            "change",
            buildPassengerFields
        );
    }

    if ($("submitPaymentReference")) {
        $("submitPaymentReference").addEventListener(
            "click",
            submitPaymentReference
        );
    }

    if ($("showCoaches")) {
        $("showCoaches").addEventListener("click", showCoaches);
    }

    if ($("refreshAll")) {
        $("refreshAll").addEventListener(
            "click",
            refreshAllData
        );
    }

    document.querySelectorAll("[data-tab]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(
                ".booking-tab-content"
            ).forEach(tab => {
                tab.classList.toggle(
                    "booking-hidden",
                    tab.id !== button.dataset.tab
                );
            });
        });
    });
}


/* PAYMENT METHOD */

if ($("paymentMethod")) {
    $("paymentMethod").addEventListener("change", () => {
        const method = $("paymentMethod").value;

        if (method === "UPI") {
            $("upiPayment")?.classList.remove("booking-hidden");
            $("gatewayMessage")?.classList.add("booking-hidden");
        } else {
            $("upiPayment")?.classList.add("booking-hidden");
            $("gatewayMessage")?.classList.remove("booking-hidden");
        }
    });
}


/* START */

initializeAuthentication();
initializePageControls();
initializeBookingPage();
