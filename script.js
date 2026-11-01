/* =========================================
   TRACKMATE JAVASCRIPT
========================================= */


/* =========================================
   PASSWORD SHOW / HIDE
========================================= */

const passwordInput =
    document.getElementById("password");

const passwordToggle =
    document.getElementById("passwordToggle");


if (passwordToggle && passwordInput) {

    passwordToggle.addEventListener(
        "click",
        function () {

            if (passwordInput.type === "password") {

                passwordInput.type = "text";

                passwordToggle.textContent = "🙈";

                passwordToggle.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            } else {

                passwordInput.type = "password";

                passwordToggle.textContent = "👁";

                passwordToggle.setAttribute(
                    "aria-label",
                    "Show password"
                );

            }

        }
    );

}


/* =========================================
   LOGIN
========================================= */

const loginForm =
    document.getElementById("loginForm");

const loginMessage =
    document.getElementById("loginMessage");


if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const email =
                document
                    .getElementById("email")
                    .value
                    .trim();


            const password =
                document
                    .getElementById("password")
                    .value;


            loginMessage.textContent =
                "Signing in...";

            loginMessage.className =
                "login-message";


            try {

                const response =
                    await fetch(
                        "/api/login",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    email,
                                    password
                                })
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    loginMessage.textContent =
                        data.error ||
                        "Invalid email or password.";

                    loginMessage.className =
                        "login-message error";

                    return;

                }


                loginMessage.textContent =
                    "Login successful!";

                loginMessage.className =
                    "login-message success";


                setTimeout(
                    function () {

                        window.location.href =
                            "/booking.html";

                    },
                    600
                );


            } catch (error) {

                console.error(
                    "Login error:",
                    error
                );


                loginMessage.textContent =
                    "Unable to connect to server.";

                loginMessage.className =
                    "login-message error";

            }

        }
    );

}


/* =========================================
   REGISTRATION
========================================= */

const registerForm =
    document.getElementById("registerForm");

const registerMessage =
    document.getElementById("registerMessage");


if (registerForm) {

    registerForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const name =
                document
                    .getElementById("name")
                    .value
                    .trim();


            const email =
                document
                    .getElementById("email")
                    .value
                    .trim();


            const password =
                document
                    .getElementById("password")
                    .value;


            registerMessage.textContent =
                "Creating account...";

            registerMessage.className =
                "login-message";


            try {

                const response =
                    await fetch(
                        "/api/register",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    name,
                                    email,
                                    password
                                })
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    registerMessage.textContent =
                        data.error ||
                        "Unable to create account.";

                    registerMessage.className =
                        "login-message error";

                    return;

                }


                registerMessage.textContent =
                    "Account created successfully!";

                registerMessage.className =
                    "login-message success";


                setTimeout(
                    function () {

                        window.location.href =
                            "/";

                    },
                    700
                );


            } catch (error) {

                console.error(
                    "Registration error:",
                    error
                );


                registerMessage.textContent =
                    "Could not connect to the server.";

                registerMessage.className =
                    "login-message error";

            }

        }
    );

}
/* =========================================
   TICKET BOOKING
========================================= */

const ticketForm =
    document.getElementById("ticketForm");

const ticketMessage =
    document.getElementById("ticketMessage");

const ticketResult =
    document.getElementById("ticketResult");

const logoutButton =
    document.getElementById("logoutButton");


/* LOGOUT */

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        async function () {

            try {

                await fetch(
                    "/api/logout",
                    {
                        method: "POST"
                    }
                );

            } catch (error) {

                console.error(
                    "Logout error:",
                    error
                );

            }

            window.location.href = "/";

        }
    );

}


/* TICKET FORM */

if (ticketForm) {

    ticketForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const name =
                document
                    .getElementById("ticketName")
                    .value
                    .trim();


            const age =
                document
                    .getElementById("ticketAge")
                    .value;


            const email =
                document
                    .getElementById("ticketEmail")
                    .value
                    .trim();


            const preference =
                document
                    .getElementById("ticketPreference")
                    .value;


            ticketMessage.textContent =
                "Booking ticket...";

            ticketMessage.className =
                "ticket-message";


            try {

                const response =
                    await fetch(
                        "/api/ticket",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    name,
                                    age,
                                    email,
                                    preference
                                })
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    ticketMessage.textContent =
                        data.error ||
                        "Unable to book ticket.";

                    ticketMessage.className =
                        "ticket-message error";

                    return;

                }


                ticketMessage.textContent =
                    "Ticket booked successfully!";

                ticketMessage.className =
                    "ticket-message success";


                document
                    .getElementById("resultTicketId")
                    .textContent =
                        data.ticket.ticket_id;


                document
                    .getElementById("resultName")
                    .textContent =
                        data.ticket.name;


                document
                    .getElementById("resultAge")
                    .textContent =
                        data.ticket.age;


                document
                    .getElementById("resultEmail")
                    .textContent =
                        data.ticket.email;


                document
                    .getElementById("resultPreference")
                    .textContent =
                        data.ticket.preference;


                ticketResult.style.display =
                    "block";


                ticketForm.style.display =
                    "none";


            } catch (error) {

                console.error(
                    "Ticket booking error:",
                    error
                );

                ticketMessage.textContent =
                    "Could not connect to the server.";

                ticketMessage.className =
                    "ticket-message error";

            }

        }
    );

}