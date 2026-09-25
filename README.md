
# Smart Pantry – Pantry Management Web Application

A web-based pantry management application built using Python, FastAPI, SQLite, HTML, CSS, and JavaScript. It helps users manage pantry items, track quantities, and monitor expiry dates.

## Features

- User registration and login authentication
- Add, view, edit, and delete pantry items
- Track item quantities and units
- Monitor expiry dates of pantry items
- Store user and pantry data using SQLite
- Interactive web interface

## Tech Stack

| Technology | Purpose |
|---|---|
| Python | Backend development |
| FastAPI | REST API and application framework |
| SQLite | Database management |
| HTML | Webpage structure |
| CSS | Styling and layout |
| JavaScript | Frontend interactivity |

## Project Structure

```text
Smart-Pantry/
│
├── main.py
├── database.py
├── pantry.db
├── templates/
│   └── index.html
├── static/
│   ├── style.css
│   └── script.js
└── README.md
```

Note: The local database file and virtual environment should not be uploaded to GitHub if they contain personal data or unnecessary files.

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/smart-pantry.git
```

### 2. Navigate to the project folder

```bash
cd smart-pantry
```

### 3. Create a virtual environment

```bash
python -m venv venv
```

### 4. Activate the virtual environment

Windows:

```bash
venv\Scripts\activate
```

### 5. Install dependencies

```bash
pip install fastapi uvicorn
```

If your project uses additional Python packages, install those as well.

### 6. Run the application

```bash
python -m uvicorn main:app --reload
```

Open the following URL in your browser:

http://127.0.0.1:8000

## Learning Outcomes

- Backend development using FastAPI
- Working with SQLite databases
- Building and connecting frontend and backend components
- Implementing user authentication
- Developing a full-stack web application

## Author

Pallavi Nakil

GitHub: https://github.com/YOUR-USERNAME
