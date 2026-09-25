#include <iostream>
#include <string>
using namespace std;

class LoginSystem
{
private:
    string username;
    string password;

public:
   
    {
        username = "raghav";
        password = "12345";
    }

    {
        string enteredUsername;
        string enteredPassword;

        cout << "\n====================================\n";
        cout << "       TRAIN TICKET BOOKING\n";
        cout << "====================================\n";

        cout << "Enter Username: ";
        cin >> enteredUsername;

        cout << "Enter Password: ";
        cin >> enteredPassword;

        if (enteredUsername == username &&
            enteredPassword == password)
        {
            return true;
        }

        return false;
    }
};

int main()
{
    LoginSystem user;

    if (user.login())
    {
        cout << "\nLogin Successful!\n";
        cout << "Welcome to the Train Booking System.\n";
        cout << "Default Source: Dehradun\n";
    }
    else
    {
        cout << "\nInvalid Username or Password!\n";
        cout << "Access Denied.\n";
    }

    return 0;
}