/* =========================================
   TRACKMATE LOGIN SYSTEM
   ========================================= */


/*
    These are the credentials from the
    original C++ program.

    Username: raghav
    Password: 12345
*/

const VALID_USERNAME = "raghav";
const VALID_PASSWORD = "12345";


/* Get elements from the page */

const loginForm = document.getElementById("loginForm");

const usernameInput =
    document.getElementById("username");

const passwordInput =
    document.getElementById("password");

const passwordToggle =
    document.getElementById("passwordToggle");

const loginMessage =
    document.getElementById("loginMessage");


/* =========================================
   PASSWORD VISIBILITY
   ========================================= */

passwordToggle.addEventListener("click", function () {

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

});


/* =========================================
   LOGIN
   ========================================= */

loginForm.addEventListener("submit", function (event) {

    event.preventDefault();


    const enteredUsername =
        usernameInput.value.trim();

    const enteredPassword =
        passwordInput.value;


    /* Clear previous message */

    loginMessage.textContent = "";

    loginMessage.className =
        "login-message";


    /*
        Compare the entered credentials
        with the values from the C++ program.
    */

    if (
        enteredUsername === VALID_USERNAME &&
        enteredPassword === VALID_PASSWORD
    ) {

        loginMessage.textContent =
            "Login successful!";

        loginMessage.classList.add("success");


        /*
            Small delay before going
            to the booking page.
        */

        setTimeout(function () {

            window.location.href =
                "booking.html";

        }, 700);

    } else {

        loginMessage.textContent =
            "Invalid username or password.";

        loginMessage.classList.add("error");


        passwordInput.value = "";

        passwordInput.focus();

    }

});