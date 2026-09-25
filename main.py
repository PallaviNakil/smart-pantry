
import os
import sqlite3
import hashlib
import secrets
import hmac
import base64
import json
import time

from pathlib import Path
from datetime import date
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from database import create_tables

app = FastAPI(title="Smart Pantry")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "pantry.db"

app.mount(
    "/static",
    StaticFiles(directory=str(BASE_DIR / "static")),
    name="static"
)

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

SECRET_KEY = os.getenv(
    "SMART_PANTRY_SECRET",
    "smart-pantry-local-development-secret-change-this"
)

COOKIE_NAME = "sp_session"
SESSION_DURATION = 7 * 24 * 60 * 60


# ---------------- DATABASE ----------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.on_event("startup")
def startup():
    create_tables()


def row_to_list(row):
    return list(row)


# ---------------- PASSWORD SECURITY ----------------

def hash_password(password):
    salt = secrets.token_bytes(16)

    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt,
        200000
    )

    salt_text = base64.urlsafe_b64encode(salt).decode()
    hash_text = base64.urlsafe_b64encode(hashed).decode()

    return f"pbkdf2$200000${salt_text}${hash_text}"


def verify_password(password, stored):
    try:
        algorithm, iterations, salt_text, hash_text = stored.split("$")

        if algorithm != "pbkdf2":
            return False

        salt = base64.urlsafe_b64decode(salt_text)
        expected = base64.urlsafe_b64decode(hash_text)

        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            salt,
            int(iterations)
        )

        return hmac.compare_digest(actual, expected)

    except Exception:
        return False


# ---------------- LOGIN SESSION ----------------

def create_session(user_id):
    payload = {
        "user_id": user_id,
        "expires": int(time.time()) + SESSION_DURATION
    }

    data = base64.urlsafe_b64encode(
        json.dumps(payload).encode()
    ).decode().rstrip("=")

    signature = hmac.new(
        SECRET_KEY.encode(),
        data.encode(),
        hashlib.sha256
    ).hexdigest()

    return f"{data}.{signature}"


def get_session_user(request: Request):
    token = request.cookies.get(COOKIE_NAME)

    if not token:
        return None

    try:
        data, signature = token.rsplit(".", 1)

        expected_signature = hmac.new(
            SECRET_KEY.encode(),
            data.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(
            signature,
            expected_signature
        ):
            return None

        padded_data = data + "=" * (-len(data) % 4)

        payload = json.loads(
            base64.urlsafe_b64decode(padded_data)
        )

        if payload["expires"] < int(time.time()):
            return None

        return int(payload["user_id"])

    except Exception:
        return None


def require_user(request: Request):
    user_id = get_session_user(request)

    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Please log in first."
        )

    return user_id


def set_session_cookie(response, user_id):
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session(user_id),
        httponly=True,
        samesite="lax",
        max_age=SESSION_DURATION,
        path="/"
    )


# ---------------- HOME PAGE ----------------

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={}
    )


# ---------------- AUTHENTICATION ----------------

@app.get("/auth/me")
def auth_me(request: Request):
    user_id = get_session_user(request)

    if not user_id:
        return {"logged_in": False}

    with get_db() as conn:
        user = conn.execute(
            "SELECT id, name, email FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

    if not user:
        return {"logged_in": False}

    return {
        "logged_in": True,
        "name": user["name"],
        "email": user["email"]
    }


@app.post("/auth/signup")
async def signup(request: Request):
    data = await request.json()

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or not password:
        raise HTTPException(
            status_code=400,
            detail="Please fill in all fields."
        )

    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters."
        )

    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=400,
                detail="An account with this email already exists."
            )

        user_count = conn.execute(
            "SELECT COUNT(*) FROM users"
        ).fetchone()[0]

        cursor = conn.execute(
            """
            INSERT INTO users (name, email, password_hash)
            VALUES (?, ?, ?)
            """,
            (name, email, hash_password(password))
        )

        user_id = cursor.lastrowid

        # Assign existing pantry items to the first account.
        # This preserves your existing pantry data.
        if user_count == 0:
            conn.execute(
                """
                UPDATE pantry_items
                SET user_id = ?
                WHERE user_id IS NULL
                """,
                (user_id,)
            )

    response = Response(
        content=json.dumps({
            "message": "Account created successfully.",
            "logged_in": True
        }),
        media_type="application/json"
    )

    set_session_cookie(response, user_id)

    return response


@app.post("/auth/login")
async def login(request: Request):
    data = await request.json()

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    with get_db() as conn:
        user = conn.execute(
            """
            SELECT id, password_hash
            FROM users
            WHERE email = ?
            """,
            (email,)
        ).fetchone()

    if not user or not verify_password(
        password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password."
        )

    response = Response(
        content=json.dumps({
            "message": "Login successful.",
            "logged_in": True
        }),
        media_type="application/json"
    )

    set_session_cookie(response, user["id"])

    return response


@app.post("/auth/logout")
def logout():
    response = Response(
        content=json.dumps({
            "message": "Logged out successfully."
        }),
        media_type="application/json"
    )

    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax"
    )

    return response


# ---------------- PANTRY ITEMS ----------------

@app.get("/items")
def get_items(request: Request):
    user_id = require_user(request)

    with get_db() as conn:
        items = conn.execute(
            """
            SELECT id, name, quantity, unit,
                   expiry_date, minimum_quantity
            FROM pantry_items
            WHERE user_id = ?
            ORDER BY id DESC
            """,
            (user_id,)
        ).fetchall()

    return [row_to_list(item) for item in items]


@app.post("/items")
def add_item(
    request: Request,
    name: str,
    quantity: float,
    unit: str,
    expiry_date: str = "",
    minimum_quantity: float = 1
):
    user_id = require_user(request)

    if not name.strip():
        raise HTTPException(
            status_code=400,
            detail="Item name is required."
        )

    if quantity < 0 or minimum_quantity < 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity cannot be negative."
        )

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO pantry_items
            (name, quantity, unit, expiry_date,
             minimum_quantity, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                name.strip(),
                quantity,
                unit,
                expiry_date,
                minimum_quantity,
                user_id
            )
        )

    return {"message": "Item added successfully."}


@app.put("/items/{item_id}")
def update_item(
    item_id: int,
    request: Request,
    name: str,
    quantity: float,
    unit: str,
    expiry_date: str = "",
    minimum_quantity: float = 1
):
    user_id = require_user(request)

    with get_db() as conn:
        cursor = conn.execute(
            """
            UPDATE pantry_items
            SET name = ?, quantity = ?, unit = ?,
                expiry_date = ?, minimum_quantity = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                name.strip(),
                quantity,
                unit,
                expiry_date,
                minimum_quantity,
                item_id,
                user_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Item not found."
            )

    return {"message": "Item updated successfully."}


@app.delete("/items/{item_id}")
def delete_item(item_id: int, request: Request):
    user_id = require_user(request)

    with get_db() as conn:
        cursor = conn.execute(
            """
            DELETE FROM pantry_items
            WHERE id = ? AND user_id = ?
            """,
            (item_id, user_id)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Item not found."
            )

    return {"message": "Item deleted successfully."}


# ---------------- SHOPPING LIST ----------------

@app.get("/shopping-list")
def get_shopping_list(request: Request):
    user_id = require_user(request)

    with get_db() as conn:
        items = conn.execute(
            """
            SELECT id, name, quantity, unit,
                   expiry_date, minimum_quantity
            FROM pantry_items
            WHERE user_id = ?
              AND quantity <= minimum_quantity
            ORDER BY name
            """,
            (user_id,)
        ).fetchall()

    return [row_to_list(item) for item in items]


# ---------------- RECIPE SUGGESTIONS ----------------

RECIPES = [
    {
        "name": "Vegetable Fried Rice",
        "ingredients": ["rice", "carrot", "peas", "onion"],
        "instructions": "Cook rice, sauté vegetables with spices, "
                        "add rice and stir-fry."
    },
    {
        "name": "Aloo Paratha",
        "ingredients": ["potato", "flour", "wheat"],
        "instructions": "Mash boiled potatoes with spices, fill "
                        "the dough, roll and cook on a tawa."
    },
    {
        "name": "Tomato Pasta",
        "ingredients": ["tomato", "pasta", "garlic", "onion"],
        "instructions": "Cook pasta. Prepare a tomato and garlic "
                        "sauce, then mix together."
    },
    {
        "name": "Omelette",
        "ingredients": ["egg", "onion", "tomato"],
        "instructions": "Beat eggs with chopped vegetables and "
                        "cook in a lightly oiled pan."
    },
    {
        "name": "Banana Smoothie",
        "ingredients": ["banana", "milk", "honey"],
        "instructions": "Blend banana, milk and honey until smooth."
    },
    {
        "name": "Besan Chilla",
        "ingredients": ["besan", "onion", "tomato"],
        "instructions": "Mix besan with water and chopped vegetables. "
                        "Cook like a pancake on a tawa."
    },
    {
        "name": "Simple Dal",
        "ingredients": ["dal", "lentils", "tomato", "onion"],
        "instructions": "Boil dal until soft and prepare a simple "
                        "onion-tomato tadka."
    }
]


@app.get("/recipes")
def get_recipes(request: Request):
    user_id = require_user(request)

    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT name
            FROM pantry_items
            WHERE user_id = ? AND quantity > 0
            """,
            (user_id,)
        ).fetchall()

    pantry_ingredients = {
        row["name"].strip().lower()
        for row in rows
    }

    suggestions = []

    for recipe in RECIPES:
        matching = [
            ingredient
            for ingredient in recipe["ingredients"]
            if any(
                ingredient in pantry_item
                or pantry_item in ingredient
                for pantry_item in pantry_ingredients
            )
        ]

        if matching:
            suggestions.append({
                "name": recipe["name"],
                "ingredients": recipe["ingredients"],
                "available_ingredients": matching,
                "instructions": recipe["instructions"],
                "match_count": len(matching)
            })

    suggestions.sort(
        key=lambda recipe: recipe["match_count"],
        reverse=True
    )

    return suggestions